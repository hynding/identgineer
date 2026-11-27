<?php

declare(strict_types=1);

namespace Tests\Feature\Ingest;

use App\Hooks\IngestEvent;
use App\Hooks\PurgeExpiredEvents;
use App\Ingest\IngestedEvent;
use App\Models\Event;
use App\Models\Property;
use App\Models\User;
use App\Support\StrapiError;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * POST /api/ingest/events on strapi-php, through the whole app: camis' route, guards and CORS, then
 * the handler. Each refusal the issue lists, what is stored, and what never is.
 */
final class IngestEventEndpointTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'https://shop.example.com';

    private const ADDRESS = '203.0.113.77';

    private const EVENT_ID = 'AAAAAAAAAAAAAAAAAAAAAA';

    private string $userAgent;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        // Each test its own marker, looked for in the database and the log afterwards.
        $this->userAgent = 'IngestProbe/'.Str::random(24);
        config(['camis-endpoints.IngestEvent.throttle_per_minute' => 1000, 'ingest.key_rate_per_minute' => 1000]);
        // A decoy first, so the property's owner is not user 1 and a stored owner id must be its own.
        User::factory()->create();
        $this->property = $this->property();
    }

    /** @param array<string, mixed> $fields */
    private function property(array $fields = []): Property
    {
        $owner = User::factory()->create();
        $property = Property::query()->create($fields + [
            'name' => 'Shop',
            'domain' => 'shop.example.com',
            'ingest_key' => 'pk_'.str_repeat('a', 40),
            'retention_days' => 180,
            'active' => true,
            'owner_id' => $owner->getKey(),
        ]);
        $property->allowedOrigins()->create(['origin' => self::ORIGIN]);
        $signup = $property->allowedEvents()->create(['name' => 'signup_completed']);
        $signup->propertyKeys()->create(['key' => 'plan']);
        $property->allowedQueryParams()->create(['name' => 'utm_source']);

        return $property->refresh();
    }

    private static function nowMs(): int
    {
        return (int) floor(microtime(true) * 1000);
    }

    /** @return array<string, mixed> */
    private static function event(array $fields = []): array
    {
        return $fields + ['id' => self::EVENT_ID, 'name' => 'signup_completed', 'at' => self::nowMs() - 1000, 'session' => 'SSSSSSSSSSSSSSSSSSSSSS'];
    }

    /** @return array<string, mixed> */
    private static function batch(array $fields = []): array
    {
        return $fields + ['v' => 1, 'sentAt' => self::nowMs(), 'transport' => 'fetch', 'events' => [self::event()]];
    }

    /** @return array<string, mixed> */
    private function beacon(array $fields = []): array
    {
        return self::batch($fields + ['transport' => 'beacon', 'writeKey' => $this->property->ingest_key]);
    }

    /**
     * Sends a request as a browser page on ORIGIN would; a header given as null is left out.
     *
     * @param  array<string, mixed>|string  $body
     * @param  array<string, ?string>  $headers
     */
    private function ingest(array|string $body, array $headers = []): TestResponse
    {
        $content = is_string($body) ? $body : json_encode($body, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        $server = [
            'CONTENT_TYPE' => 'application/json',
            'CONTENT_LENGTH' => (string) strlen($content),
            'HTTP_ORIGIN' => self::ORIGIN,
            'HTTP_X_IDG_WRITE_KEY' => $this->property->ingest_key,
            'HTTP_USER_AGENT' => $this->userAgent,
            'REMOTE_ADDR' => self::ADDRESS,
        ];
        foreach ($headers as $name => $value) {
            unset($server[$name]);
            if ($value !== null) {
                $server[$name] = $value;
            }
        }

        return $this->call('POST', '/api/ingest/events', [], [], [], $server, $content);
    }

    private function assertAccepted(TestResponse $response): void
    {
        $response->assertStatus(202);
        $this->assertSame('', $response->getContent());
    }

    public function test_a_fetch_batch_is_stored_against_the_keys_property_and_answered_202_without_a_body(): void
    {
        $this->assertAccepted($this->ingest(self::batch()));
        $event = Event::query()->sole();
        $this->assertSame($this->property->getKey(), (int) $event->property_id);
        $this->assertSame($this->property->owner_id, (int) $event->owner_id);
        $this->assertSame('signup_completed', $event->name);
        $this->assertSame(IngestedEvent::dedupeKey((int) $this->property->getKey(), self::EVENT_ID), $event->dedupe_key);
        $this->assertSame('SSSSSSSSSSSSSSSSSSSSSS', $event->session_id);
        $this->assertNull($event->path);
        $this->assertNull($event->referrer_host);
        $this->assertNull($event->properties);
        $this->assertNotSame('', (string) $event->document_id);
    }

    public function test_a_beacon_carries_its_key_in_a_text_body_and_needs_no_header(): void
    {
        $this->assertAccepted($this->ingest($this->beacon(), ['CONTENT_TYPE' => 'text/plain;charset=UTF-8', 'HTTP_X_IDG_WRITE_KEY' => null]));
        $this->assertSame(1, Event::query()->count());
    }

    public function test_a_beacons_body_key_wins_over_a_header(): void
    {
        $other = $this->property(['ingest_key' => 'pk_'.str_repeat('b', 40)]);
        $this->ingest($this->beacon(), ['CONTENT_TYPE' => 'text/plain', 'HTTP_X_IDG_WRITE_KEY' => $other->ingest_key]);
        $this->assertSame([$this->property->getKey()], Event::query()->pluck('property_id')->map('intval')->all());
    }

    public function test_a_repeated_event_is_stored_once_and_still_accepted(): void
    {
        $this->assertAccepted($this->ingest(self::batch()));
        $this->assertAccepted($this->ingest(self::batch()));
        $this->assertSame(1, Event::query()->count());
    }

    public function test_an_event_another_request_stored_meanwhile_is_skipped_by_the_unique_index_alone(): void
    {
        // As a request running at the same moment would have: the row is there, the handler never looked.
        Event::query()->create([
            'name' => 'signup_completed',
            'dedupe_key' => IngestedEvent::dedupeKey((int) $this->property->getKey(), self::EVENT_ID),
            'occurred_at' => Carbon::now(),
            'property_id' => $this->property->getKey(),
            'owner_id' => $this->property->owner_id,
        ]);
        $queries = [];
        DB::listen(static function ($query) use (&$queries): void {
            $queries[] = $query->sql;
        });
        $this->assertAccepted($this->ingest(self::batch(['events' => [self::event(), self::event(['id' => str_repeat('B', 22)])]])));
        $reads = array_values(array_filter($queries, static fn (string $sql): bool => str_contains($sql, 'from "events"')));
        $this->assertSame([], $reads, 'no read of events before writing');
        $this->assertSame(2, Event::query()->count());
    }

    public function test_one_event_id_on_two_properties_is_two_events(): void
    {
        $other = $this->property(['ingest_key' => 'pk_'.str_repeat('b', 40)]);
        $this->ingest(self::batch());
        $this->ingest(self::batch(), ['HTTP_X_IDG_WRITE_KEY' => $other->ingest_key]);
        $this->assertSame(2, Event::query()->count());
    }

    public function test_events_not_allowed_or_outside_the_window_are_skipped_and_the_batch_still_accepted(): void
    {
        $now = self::nowMs();
        $this->assertAccepted($this->ingest(self::batch(['events' => [
            self::event(['id' => str_repeat('A', 22), 'name' => 'unlisted']),
            self::event(['id' => str_repeat('B', 22), 'at' => $now - 26 * 3600000]),
            self::event(['id' => str_repeat('C', 22), 'at' => $now + 600000]),
            self::event(['id' => str_repeat('D', 22), 'name' => 'page_view', 'properties' => ['plan' => 'x']]),
        ]])));
        $event = Event::query()->sole();
        $this->assertSame('page_view', $event->name);
        $this->assertNull($event->properties);
    }

    public function test_the_time_is_corrected_by_the_clients_clock_skew(): void
    {
        $now = self::nowMs();
        // A client clock a day slow.
        $this->ingest(self::batch(['sentAt' => $now - 86400000, 'events' => [self::event(['at' => $now - 86400000 - 5000])]]));
        $stored = Event::query()->sole()->occurred_at->getTimestampMs();
        $this->assertGreaterThanOrEqual($now - 5000, $stored);
        $this->assertLessThan($now + 5000 - 4000, $stored);
    }

    public function test_only_what_the_model_keeps_is_stored_and_nothing_identifying_reaches_the_database_or_the_log(): void
    {
        $this->assertAccepted($this->ingest(self::batch(['events' => [self::event([
            'user' => 'visitor_42',
            'path' => '/p?utm_source=news&email=ada%40example.com',
            'referrer' => 'https://News.example.org',
            'properties' => ['plan' => 'pro', 'email' => 'x'],
        ])]])));
        $event = Event::query()->sole();
        $this->assertSame('/p?utm_source=news', $event->path);
        $this->assertSame('news.example.org', $event->referrer_host);
        $this->assertSame(['plan' => 'pro'], $event->properties);

        $stored = json_encode([DB::table('events')->get(), DB::table('cache')->get()], JSON_THROW_ON_ERROR);
        $log = is_file(storage_path('logs/laravel.log')) ? (string) file_get_contents(storage_path('logs/laravel.log')) : '';
        foreach (['visitor_42', self::ADDRESS, $this->userAgent, $this->property->ingest_key, 'ada%40example.com'] as $secret) {
            $this->assertStringNotContainsString($secret, $stored);
            $this->assertStringNotContainsString($secret, $log);
        }
    }

    public function test_another_body_type_is_refused_with_415(): void
    {
        $this->ingest('a=1', ['CONTENT_TYPE' => 'application/x-www-form-urlencoded'])->assertStatus(415);
        $this->ingest(self::batch(), ['CONTENT_TYPE' => 'multipart/form-data; boundary=x'])->assertStatus(415);
        $this->assertSame(0, Event::query()->count());
    }

    public function test_a_body_over_the_wire_cap_is_refused_with_413_by_the_declared_guard(): void
    {
        $this->ingest(str_repeat(' ', 65537), ['CONTENT_TYPE' => 'text/plain'])->assertStatus(413);
        // A Content-Length that understates the body does not help.
        $this->ingest(str_repeat(' ', 65537), ['CONTENT_TYPE' => 'text/plain', 'CONTENT_LENGTH' => '10'])->assertStatus(413);
    }

    public function test_a_body_over_the_configured_ingest_limit_is_refused_with_413_before_it_is_parsed(): void
    {
        config(['ingest.max_body_bytes' => 100]);
        $this->ingest(str_repeat('{', 101), ['CONTENT_TYPE' => 'text/plain'])->assertStatus(413);
        $this->ingest(str_repeat('{', 101), ['CONTENT_TYPE' => 'text/plain', 'CONTENT_LENGTH' => '50'])->assertStatus(413);
        $this->ingest('{', ['CONTENT_TYPE' => 'text/plain'])->assertStatus(400);
    }

    /** @return iterable<string, array{string}> */
    public static function invalidBodies(): iterable
    {
        yield 'not JSON' => ['{'];
        yield 'an unknown field' => ['{"v":1,"sentAt":1,"transport":"fetch","events":[{"id":"AAAAAAAAAAAAAAAAAAAAAA","name":"a","at":1}],"property":7}'];
        yield 'one invalid event among valid ones' => ['{"v":1,"sentAt":1,"transport":"fetch","events":[{"id":"AAAAAAAAAAAAAAAAAAAAAA","name":"a","at":1},{"id":"short","name":"a","at":1}]}'];
        yield 'a key in a fetch batch' => ['{"v":1,"sentAt":1,"transport":"fetch","writeKey":"pk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","events":[{"id":"AAAAAAAAAAAAAAAAAAAAAA","name":"a","at":1}]}'];
    }

    #[DataProvider('invalidBodies')]
    public function test_an_invalid_batch_is_refused_whole_with_400(string $body): void
    {
        $this->ingest($body)->assertStatus(400)->assertJsonPath('error.name', 'ValidationError');
        $this->assertSame(0, Event::query()->count());
    }

    public function test_an_unknown_key_and_an_inactive_key_are_refused_alike_with_404(): void
    {
        $unknown = $this->ingest(self::batch(), ['HTTP_X_IDG_WRITE_KEY' => 'pk_'.str_repeat('z', 40)]);
        $this->property->update(['active' => false]);
        $inactive = $this->ingest(self::batch());
        $unknown->assertStatus(404);
        $inactive->assertStatus(404);
        $this->assertSame($unknown->getContent(), $inactive->getContent());
        $this->assertSame(0, Event::query()->count());
    }

    public function test_a_fetch_without_a_well_formed_key_header_is_refused_with_404(): void
    {
        $this->ingest(self::batch(), ['HTTP_X_IDG_WRITE_KEY' => null])->assertStatus(404);
        $this->ingest(self::batch(), ['HTTP_X_IDG_WRITE_KEY' => 'pk_short'])->assertStatus(404);
    }

    /** @return iterable<string, array{?string}> */
    public static function refusedOrigins(): iterable
    {
        yield 'no Origin' => [null];
        yield 'another origin' => ['https://evil.example'];
        yield 'the origin over http' => ['http://shop.example.com'];
        yield 'an opaque origin' => ['null'];
    }

    #[DataProvider('refusedOrigins')]
    public function test_an_origin_the_property_does_not_list_is_refused_with_403(?string $origin): void
    {
        $this->ingest(self::batch(), ['HTTP_ORIGIN' => $origin])->assertStatus(403);
        $this->assertSame(0, Event::query()->count());
    }

    public function test_a_key_over_its_rate_is_refused_with_429_and_retry_after(): void
    {
        config(['ingest.key_rate_per_minute' => 2]);
        $this->assertAccepted($this->ingest(self::batch(['events' => [self::event(['id' => str_repeat('A', 22)])]])));
        // Another address, the same key: still counted.
        $this->assertAccepted($this->ingest(self::batch(['events' => [self::event(['id' => str_repeat('B', 22)])]]), ['REMOTE_ADDR' => '198.51.100.1']));
        $limited = $this->ingest(self::batch(['events' => [self::event(['id' => str_repeat('C', 22)])]]));
        $limited->assertStatus(429)->assertJsonPath('error.name', 'RateLimitError');
        $this->assertGreaterThanOrEqual(1, (int) $limited->headers->get('Retry-After'));
        $this->assertSame(2, Event::query()->count());
        $other = $this->property(['ingest_key' => 'pk_'.str_repeat('b', 40)]);
        $this->assertAccepted($this->ingest(self::batch(), ['HTTP_X_IDG_WRITE_KEY' => $other->ingest_key]));
    }

    public function test_an_address_over_the_endpoints_rate_is_refused_with_429_by_the_declared_guard(): void
    {
        config(['camis-endpoints.IngestEvent.throttle_per_minute' => 2]);
        $this->ingest(self::batch(), ['HTTP_X_IDG_WRITE_KEY' => 'pk_'.str_repeat('z', 40)])->assertStatus(404);
        $this->ingest(self::batch(), ['HTTP_X_IDG_WRITE_KEY' => 'pk_'.str_repeat('z', 40)])->assertStatus(404);
        $limited = $this->ingest(self::batch());
        $limited->assertStatus(429);
        $this->assertGreaterThanOrEqual(1, (int) $limited->headers->get('Retry-After'));
        $this->assertAccepted($this->ingest(self::batch(), ['REMOTE_ADDR' => '198.51.100.1']));
        $this->assertStringNotContainsString(self::ADDRESS, json_encode(DB::table('cache')->get(), JSON_THROW_ON_ERROR));
    }

    public function test_the_endpoint_answers_a_browser_preflight_itself_allowing_the_sdks_headers(): void
    {
        $preflight = $this->call('OPTIONS', '/api/ingest/events', [], [], [], [
            'HTTP_ORIGIN' => self::ORIGIN,
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'content-type,x-idg-write-key',
        ]);
        $this->assertLessThan(300, $preflight->getStatusCode());
        $this->assertSame('*', $preflight->headers->get('Access-Control-Allow-Origin'));
        $allowed = strtolower((string) $preflight->headers->get('Access-Control-Allow-Headers'));
        $this->assertStringContainsString('x-idg-write-key', $allowed);
        $this->assertStringContainsString('content-type', $allowed);
        $this->assertFalse($preflight->headers->has('Access-Control-Allow-Credentials'));

        $refused = $this->ingest(self::batch(), ['HTTP_ORIGIN' => 'https://evil.example']);
        $this->assertSame('*', $refused->headers->get('Access-Control-Allow-Origin'));
        $this->assertStringContainsStringIgnoringCase('Retry-After', (string) $refused->headers->get('Access-Control-Expose-Headers'));
    }

    public function test_a_key_reads_nothing(): void
    {
        $this->ingest(self::batch());
        foreach (['/api/events', '/api/properties', '/api/consent-records'] as $path) {
            $answer = $this->call('GET', $path, [], [], [], [
                'HTTP_ORIGIN' => self::ORIGIN,
                'HTTP_X_IDG_WRITE_KEY' => $this->property->ingest_key,
                'HTTP_AUTHORIZATION' => 'Bearer '.$this->property->ingest_key,
            ]);
            $this->assertContains($answer->getStatusCode(), [401, 403], $path);
            $this->assertStringNotContainsString('signup_completed', (string) $answer->getContent());
        }
        $this->call('GET', '/api/ingest/events')->assertStatus(404);
    }

    public function test_a_new_property_gets_an_issued_key_never_the_one_sent(): void
    {
        $chosen = 'pk_'.str_repeat('c', 40);
        $first = $this->property(['ingest_key' => $chosen]);
        $second = $this->property(['ingest_key' => $chosen]);
        foreach ([$first, $second] as $property) {
            $this->assertNotSame($chosen, $property->ingest_key);
            $this->assertMatchesRegularExpression('/\Apk_[A-Za-z0-9]{40}\z/', $property->ingest_key);
        }
        $this->assertNotSame($first->ingest_key, $second->ingest_key);
    }

    public function test_the_purge_deletes_each_propertys_events_older_than_its_retention(): void
    {
        $short = $this->property(['retention_days' => 1]);
        $row = static fn (Property $property, string $id, Carbon $at): array => [
            'name' => 'page_view',
            'dedupe_key' => IngestedEvent::dedupeKey((int) $property->getKey(), $id),
            'occurred_at' => $at,
            'property_id' => $property->getKey(),
            'owner_id' => $property->owner_id,
        ];
        Event::query()->create($row($short, 'old', Carbon::now()->subDays(2)));
        Event::query()->create($row($short, 'new', Carbon::now()->subHours(2)));
        Event::query()->create($row($this->property, 'old', Carbon::now()->subDays(2)));
        Event::query()->create($row($this->property, 'ancient', Carbon::now()->subDays(181)));
        (new PurgeExpiredEvents)->run();
        $kept = Event::query()->orderBy('id')->get()->map(static fn (Event $event): string => $event->property_id.':'.$event->dedupe_key)->all();
        $this->assertSame([
            $short->getKey().':'.IngestedEvent::dedupeKey((int) $short->getKey(), 'new'),
            $this->property->getKey().':'.IngestedEvent::dedupeKey((int) $this->property->getKey(), 'old'),
        ], $kept);
    }

    public function test_the_owner_stored_is_the_propertys_own_not_the_first_user(): void
    {
        $this->assertAccepted($this->ingest(self::batch()));
        $this->assertNotSame(1, (int) $this->property->owner_id);
        $this->assertSame((int) $this->property->owner_id, (int) Event::query()->sole()->owner_id);
    }

    /** @return iterable<string, array{string}> */
    public static function encodings(): iterable
    {
        yield 'gzip' => ['gzip'];
        yield 'deflate' => ['deflate'];
        yield 'br' => ['br'];
        yield 'upper case' => ['GZIP'];
        yield 'a list with identity' => ['gzip, identity'];
        yield 'an unknown coding' => ['x-unknown'];
    }

    #[DataProvider('encodings')]
    public function test_a_body_with_any_content_encoding_but_identity_is_refused_with_415(string $encoding): void
    {
        $this->ingest(self::batch(), ['HTTP_CONTENT_ENCODING' => $encoding])
            ->assertStatus(415)
            ->assertJsonPath('error.name', 'UnsupportedMediaTypeError');
        $this->assertSame(0, Event::query()->count());
    }

    public function test_content_encoding_identity_is_no_encoding_and_is_accepted(): void
    {
        $this->assertAccepted($this->ingest(self::batch(), ['HTTP_CONTENT_ENCODING' => ' Identity ']));
    }

    public function test_the_handlers_own_size_check_holds_without_a_content_length(): void
    {
        config(['ingest.max_body_bytes' => 100]);
        $body = json_encode($this->beacon(['events' => [self::event(['path' => '/'.str_repeat('a', 60)])]]), JSON_THROW_ON_ERROR);
        $this->ingest($body, ['CONTENT_TYPE' => 'text/plain', 'CONTENT_LENGTH' => null, 'HTTP_X_IDG_WRITE_KEY' => null])->assertStatus(413);
        $this->assertSame(0, Event::query()->count());
    }

    public function test_a_body_that_is_not_utf8_is_refused_with_400(): void
    {
        $body = '{"v":1,"sentAt":'.self::nowMs().',"transport":"fetch","events":[{"id":"'.self::EVENT_ID.'","name":"signup_completed","at":'.self::nowMs().',"properties":{"plan":"'."\xC3\x28".'"}}]}';
        $this->ingest($body)->assertStatus(400);
        $this->ingest($body, ['CONTENT_TYPE' => 'text/plain'])->assertStatus(400);
        $this->assertSame(0, Event::query()->count());
    }

    /** Two Origin headers as Apache and nginx pass them to PHP: one value, joined with ", ". */
    public function test_an_origin_joined_from_two_headers_is_refused_with_403(): void
    {
        $this->ingest(self::batch(), ['HTTP_ORIGIN' => self::ORIGIN.', '.self::ORIGIN])->assertStatus(403);
        $this->ingest(self::batch(), ['HTTP_ORIGIN' => self::ORIGIN.', https://evil.example'])->assertStatus(403);
        $this->ingest(self::batch(), ['HTTP_ORIGIN' => 'https://evil.example, '.self::ORIGIN])->assertStatus(403);
        $this->assertSame(0, Event::query()->count());
    }

    /** Two key headers as Apache and nginx pass them to PHP: one value, joined with ", ". */
    public function test_a_key_header_joined_from_two_headers_is_refused_with_404(): void
    {
        $key = $this->property->ingest_key;
        $this->ingest(self::batch(), ['HTTP_X_IDG_WRITE_KEY' => $key.', '.$key])->assertStatus(404);
    }

    /**
     * The handler alone, given a header bag that holds two values. No PHP SAPI builds one from a
     * request (the built-in server keeps the first value; Apache and nginx join them, as above): it
     * models a request built in code or by a runtime that keeps both values apart.
     */
    private function handleWithRepeated(string $header, string $value): int
    {
        $request = Request::create('/api/ingest/events', 'POST', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ORIGIN' => self::ORIGIN, 'HTTP_X_IDG_WRITE_KEY' => $this->property->ingest_key], json_encode(self::batch(), JSON_THROW_ON_ERROR));
        $request->headers->set($header, [$value, $value]);
        try {
            $response = (new IngestEvent)->handle($request);
        } catch (StrapiError $error) {
            return $error->status;
        }

        return $response->getStatusCode();
    }

    public function test_a_header_bag_holding_two_values_is_refused_like_the_strapi_handler_does(): void
    {
        $this->assertSame(403, $this->handleWithRepeated('Origin', self::ORIGIN));
        $this->assertSame(404, $this->handleWithRepeated('X-Idg-Write-Key', (string) $this->property->ingest_key));
        $this->assertSame(0, Event::query()->count());
    }

    private function logText(): string
    {
        return is_file(storage_path('logs/laravel.log')) ? (string) file_get_contents(storage_path('logs/laravel.log')) : '';
    }

    public function test_a_database_failure_in_the_lookup_answers_503_and_logs_no_key_or_query(): void
    {
        $before = strlen($this->logText());
        Schema::rename('properties', 'properties_gone');
        $this->ingest(self::batch())->assertStatus(503)->assertJsonPath('error.name', 'ServiceUnavailableError');
        $log = substr($this->logText(), $before);
        $this->assertStringContainsString('IngestEvent', $log);
        foreach ([$this->property->ingest_key, 'select', 'properties', self::ORIGIN, $this->userAgent, self::ADDRESS] as $secret) {
            $this->assertStringNotContainsString($secret, $log);
        }
    }

    public function test_a_database_failure_in_the_store_answers_503_and_logs_no_key_or_value(): void
    {
        $before = strlen($this->logText());
        Schema::rename('events', 'events_gone');
        $this->ingest(self::batch(['events' => [self::event(['user' => 'visitor_42', 'properties' => ['plan' => 'secret-plan']])]]))->assertStatus(503);
        $log = substr($this->logText(), $before);
        $this->assertStringContainsString('IngestEvent', $log);
        foreach ([$this->property->ingest_key, 'insert', 'secret-plan', 'visitor_42', self::EVENT_ID] as $secret) {
            $this->assertStringNotContainsString($secret, $log);
        }
    }

    public function test_the_purge_deletes_nothing_of_a_property_whose_retention_is_below_one_day(): void
    {
        foreach ([0, -5] as $days) {
            $property = $this->property(['retention_days' => $days]);
            Event::query()->create([
                'name' => 'page_view',
                'dedupe_key' => IngestedEvent::dedupeKey((int) $property->getKey(), 'old'),
                'occurred_at' => Carbon::now()->subDays(30),
                'property_id' => $property->getKey(),
                'owner_id' => $property->owner_id,
            ]);
        }
        (new PurgeExpiredEvents)->run();
        $this->assertSame(2, Event::query()->count());
    }
}
