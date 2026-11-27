<?php

declare(strict_types=1);

namespace Tests\Feature\Summary;

use App\Models\Event;
use App\Models\Property;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\Ingest\SharedVectors;
use Tests\TestCase;

/**
 * GET /api/properties/:id/summary on strapi-php, through the whole app: camis' route, credentials,
 * throttle and role check, then the handler, on a fixed clock. Ownership (another user's property
 * and a missing one answer alike), the ranges, and the shared vectors
 * (PROPERTY_SUMMARY_VECTORS, which cms/scripts/live-backend.js sets).
 */
final class PropertySummaryEndpointTest extends TestCase
{
    use RefreshDatabase;

    private const NOW = '2026-03-10T14:25:00.000Z';

    private User $me;

    private User $someoneElse;

    private Property $mine;

    private Property $theirs;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        config(['camis-endpoints.PropertySummary.throttle_per_minute' => 1000]);
        Carbon::setTestNow(Carbon::parse(self::NOW));
        $this->someoneElse = $this->user();
        $this->me = $this->user();
        $this->theirs = $this->property($this->someoneElse);
        $this->mine = $this->property($this->me);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function user(): User
    {
        $user = User::factory()->create();
        $user->assignRole('authenticated');

        return $user;
    }

    private function property(User $owner): Property
    {
        return Property::query()->create([
            'name' => 'Shop',
            'domain' => 'shop.example.com',
            'ingest_key' => 'pk_'.Str::random(40),
            'retention_days' => 180,
            'active' => true,
            'owner_id' => $owner->getKey(),
        ])->refresh();
    }

    private function event(Property $property, string $name, string $occurredAt, ?string $sessionId): void
    {
        Event::query()->create([
            'name' => $name,
            'dedupe_key' => hash('sha256', Str::random(32)),
            'occurred_at' => Carbon::parse($occurredAt),
            'session_id' => $sessionId,
            'property_id' => $property->getKey(),
            'owner_id' => $property->owner_id,
        ]);
    }

    private function summary(string $documentId, string $query, ?User $as = null): TestResponse
    {
        $headers = ['Accept' => 'application/json'];
        if ($as !== null) {
            $headers['Authorization'] = 'Bearer '.$as->createToken('test', ['*'])->plainTextToken;
        }

        return $this->get('/api/properties/'.$documentId.'/summary'.$query, $headers);
    }

    public function test_answers_the_owner_the_figures_uncached(): void
    {
        $this->event($this->mine, 'page_view', '2026-03-10T14:00:00.000Z', 'session-one-000001');
        $this->event($this->mine, 'signup', '2026-03-09T14:59:59.999Z', 'session-one-000001');
        $this->event($this->theirs, 'page_view', '2026-03-10T14:00:00.000Z', 'session-two-000002');

        $answer = $this->summary($this->mine->document_id, '?range=24h', $this->me);

        $answer->assertOk();
        self::assertStringContainsString('no-store', (string) $answer->headers->get('Cache-Control'));
        $zeros = [...array_fill(0, 23, 0), 1];
        self::assertSame([
            'data' => [
                'propertyId' => $this->mine->document_id,
                'range' => '24h',
                'visitors' => ['value' => 1, 'previous' => 1, 'series' => $zeros],
                'pageViews' => ['value' => 1, 'previous' => 0, 'series' => $zeros],
                'events' => ['value' => 1, 'previous' => 1, 'series' => $zeros],
            ],
        ], $answer->json());
    }

    public function test_answers_another_users_property_exactly_as_a_missing_one(): void
    {
        $this->event($this->theirs, 'page_view', '2026-03-10T14:00:00.000Z', 'session-two-000002');

        $theirs = $this->summary($this->theirs->document_id, '?range=7d', $this->me);
        $missing = $this->summary('nosuchproperty0000000003', '?range=7d', $this->me);

        $theirs->assertNotFound();
        self::assertSame($missing->getStatusCode(), $theirs->getStatusCode());
        self::assertSame($missing->getContent(), $theirs->getContent());
        self::assertSame(
            ['data' => null, 'error' => ['status' => 404, 'name' => 'NotFoundError', 'message' => 'Not Found', 'details' => []]],
            $theirs->json(),
        );
        self::assertStringContainsString('"details":{}', (string) $theirs->getContent());
        self::assertStringContainsString('no-store', (string) $theirs->headers->get('Cache-Control'));
    }

    public function test_answers_the_other_owner_its_own_property(): void
    {
        $this->event($this->theirs, 'page_view', '2026-03-10T14:00:00.000Z', 'session-two-000002');

        $answer = $this->summary($this->theirs->document_id, '?range=24h', $this->someoneElse);

        $answer->assertOk();
        self::assertSame(1, $answer->json('data.events.value'));
    }

    /**
     * The route's path as a client may spell it: Laravel's router matches the decoded path, so an
     * encoded letter or slash still reaches the summary.
     *
     * @return array<string, array{string}>
     */
    public static function spellings(): array
    {
        return [
            'plain' => ['/summary'],
            'with an encoded letter' => ['/summar%79'],
            'with an encoded slash' => ['%2Fsummary'],
        ];
    }

    private function refusal(string $spelling, array $headers = []): TestResponse
    {
        return $this->get('/api/properties/'.$this->mine->document_id.$spelling.'?range=7d', ['Accept' => 'application/json', ...$headers]);
    }

    #[DataProvider('spellings')]
    public function test_refuses_a_caller_without_a_session_before_the_handler_uncached(string $spelling): void
    {
        $answer = $this->refusal($spelling);

        $answer->assertForbidden();
        self::assertStringContainsString('no-store', (string) $answer->headers->get('Cache-Control'));
    }

    #[DataProvider('spellings')]
    public function test_refuses_a_token_that_is_not_one_uncached(string $spelling): void
    {
        $answer = $this->refusal($spelling, ['Authorization' => 'Bearer 1|not-a-token']);

        $answer->assertUnauthorized();
        self::assertStringContainsString('no-store', (string) $answer->headers->get('Cache-Control'));
    }

    #[DataProvider('spellings')]
    public function test_refuses_a_caller_past_the_throttle_uncached(string $spelling): void
    {
        config(['camis-endpoints.PropertySummary.throttle_per_minute' => 1]);
        $token = ['Authorization' => 'Bearer '.$this->me->createToken('test', ['*'])->plainTextToken];
        $this->refusal($spelling, $token)->assertOk();

        $answer = $this->refusal($spelling, $token);

        $answer->assertStatus(429);
        self::assertStringContainsString('no-store', (string) $answer->headers->get('Cache-Control'));
    }

    public function test_leaves_a_path_that_only_begins_like_the_summary_alone(): void
    {
        $answer = $this->get('/api/properties/'.$this->mine->document_id.'/summary-of-something?range=7d', ['Accept' => 'application/json']);

        $answer->assertNotFound();
        self::assertStringNotContainsString('no-store', (string) $answer->headers->get('Cache-Control'));
    }

    public function test_leaves_the_cache_headers_of_other_routes_alone(): void
    {
        $answer = $this->get('/api/properties/'.$this->mine->document_id.'?fields[0]=name', [
            'Accept' => 'application/json',
            'Authorization' => 'Bearer '.$this->me->createToken('test', ['*'])->plainTextToken,
        ]);

        $answer->assertOk();
        self::assertStringNotContainsString('no-store', (string) $answer->headers->get('Cache-Control'));
    }

    /** @return array<string, array{string}> */
    public static function badRanges(): array
    {
        return [
            'no range' => [''],
            'an unknown range' => ['?range=1h'],
            'a range in capitals' => ['?range=24H'],
            'a range sent twice' => ['?range=7d&range=7d'],
            'a range as a list' => ['?range[]=7d'],
            'a range as an object' => ['?range[$eq]=7d'],
        ];
    }

    #[DataProvider('badRanges')]
    public function test_refuses_a_range_that_is_not_one_of_the_three(string $query): void
    {
        $answer = $this->summary($this->mine->document_id, $query, $this->me);

        $answer->assertStatus(400);
        self::assertSame('ValidationError', $answer->json('error.name'));
        self::assertStringContainsString('no-store', (string) $answer->headers->get('Cache-Control'));
    }

    public function test_answers_503_when_the_count_fails_and_logs_the_class_alone(): void
    {
        Log::spy();
        Schema::drop('events');

        $this->summary($this->mine->document_id, '?range=7d', $this->me)->assertStatus(503);

        Log::shouldHaveReceived('error')->once()->with('PropertySummary: the database failed at the count (QueryException); answered 503');
    }

    public function test_answers_the_shared_vectors(): void
    {
        $vectors = SharedVectors::load('PROPERTY_SUMMARY_VECTORS')['vectors'];
        self::assertNotEmpty($vectors);
        foreach ($vectors as $vector) {
            Event::query()->delete();
            Carbon::setTestNow(Carbon::parse($vector['now']));
            foreach ($vector['events'] as $event) {
                $this->event(($event['other'] ?? false) ? $this->theirs : $this->mine, $event['name'], $event['occurredAt'], $event['sessionId']);
            }

            $answer = $this->summary($this->mine->document_id, '?range='.$vector['range'], $this->me);

            $answer->assertOk();
            self::assertSame(
                ['propertyId' => $this->mine->document_id, 'range' => $vector['range']] + $vector['expected'],
                $answer->json('data'),
                $vector['name'],
            );
        }
    }
}
