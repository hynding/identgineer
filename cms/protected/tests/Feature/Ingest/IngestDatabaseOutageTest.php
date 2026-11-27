<?php

declare(strict_types=1);

namespace Tests\Feature\Ingest;

use App\Hooks\IngestEvent;
use App\Models\Property;
use App\Models\User;
use App\Support\StrapiError;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Cache\RateLimiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * A database outage on the ingestion route with the cache in the database, as .env.example
 * recommends (CACHE_STORE=database): camis' endpoint guard counts the per-address throttle there
 * before the handler runs, and its error envelope answers a QueryException 400, which the SDK takes
 * as final. Here it must be 503, which the SDK retries, and logged without detail.
 */
final class IngestDatabaseOutageTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'https://shop.example.com';

    private const ADDRESS = '203.0.113.88';

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.default' => 'database', 'camis-endpoints.IngestEvent.throttle_per_minute' => 1000, 'ingest.key_rate_per_minute' => 1000]);
        // The limiter is a singleton over the store it was made with: made again over the database.
        $this->app->forgetInstance(RateLimiter::class);
        \Illuminate\Support\Facades\RateLimiter::clearResolvedInstances();
        $owner = User::factory()->create();
        $this->property = Property::query()->create([
            'name' => 'Shop',
            'domain' => 'shop.example.com',
            'retention_days' => 180,
            'active' => true,
            'owner_id' => $owner->getKey(),
        ]);
        $this->property->allowedOrigins()->create(['origin' => self::ORIGIN]);
        $this->property->refresh();
    }

    private static function body(): string
    {
        $now = (int) floor(microtime(true) * 1000);

        return json_encode(['v' => 1, 'sentAt' => $now, 'transport' => 'fetch', 'events' => [['id' => 'AAAAAAAAAAAAAAAAAAAAAA', 'name' => 'page_view', 'at' => $now]]], JSON_THROW_ON_ERROR);
    }

    private function ingest(): TestResponse
    {
        $body = self::body();

        return $this->call('POST', '/api/ingest/events', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'CONTENT_LENGTH' => (string) strlen($body),
            'HTTP_ORIGIN' => self::ORIGIN,
            'HTTP_X_IDG_WRITE_KEY' => $this->property->ingest_key,
            'REMOTE_ADDR' => self::ADDRESS,
        ], $body);
    }

    private function logText(): string
    {
        return is_file(storage_path('logs/laravel.log')) ? (string) file_get_contents(storage_path('logs/laravel.log')) : '';
    }

    public function test_the_database_cache_store_counts_the_guards_throttle(): void
    {
        $this->ingest()->assertStatus(202);
        $this->assertGreaterThan(0, DB::table('cache')->where('key', 'like', '%camis-endpoint|IngestEvent|%')->count());
    }

    public function test_a_broken_cache_table_before_the_handler_answers_503_logged_without_detail(): void
    {
        $before = strlen($this->logText());
        Schema::rename('cache', 'cache_gone');
        $this->ingest()
            ->assertStatus(503)
            ->assertExactJson(['data' => null, 'error' => ['status' => 503, 'name' => 'ServiceUnavailableError', 'message' => 'Service Unavailable', 'details' => []]]);
        $log = substr($this->logText(), $before);
        $this->assertStringContainsString('IngestEvent', $log);
        foreach (['select', 'cache', self::ADDRESS, (string) $this->property->ingest_key, 'camis-endpoint'] as $secret) {
            $this->assertStringNotContainsString($secret, $log);
        }
    }

    public function test_the_handlers_own_key_counter_answers_503_when_the_cache_fails(): void
    {
        Schema::rename('cache', 'cache_gone');
        $body = self::body();
        $request = Request::create('/api/ingest/events', 'POST', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ORIGIN' => self::ORIGIN, 'HTTP_X_IDG_WRITE_KEY' => $this->property->ingest_key], $body);
        try {
            (new IngestEvent)->handle($request);
            $this->fail('the handler answered');
        } catch (StrapiError $error) {
            $this->assertSame(503, $error->status);
        }
    }

    public function test_a_database_failure_on_another_api_route_keeps_camis_answer(): void
    {
        // The public pages list reads the database without a session; only the ingestion route is changed.
        $this->seed(RolePermissionSeeder::class);
        Schema::rename('pages', 'pages_gone');
        $this->getJson('/api/pages')->assertStatus(400)->assertJsonPath('error.name', 'ValidationError');
    }
}
