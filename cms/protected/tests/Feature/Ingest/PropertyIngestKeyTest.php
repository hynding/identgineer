<?php

declare(strict_types=1);

namespace Tests\Feature\Ingest;

use App\Models\Property;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * A property's ingest key is the server's, on strapi-php's content API: issued on create, never
 * taken from a client on create or update (DropClientIngestKey, IssueIngestKey).
 */
final class PropertyIngestKeyTest extends TestCase
{
    use RefreshDatabase;

    private const STRONG_KEY = '/\Apk_[A-Za-z0-9]{32,61}\z/';

    private const CHOSEN = 'pk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    /** A signed-in owner's bearer token, through the password login. */
    private function signIn(string $name): string
    {
        $user = User::factory()->create(['username' => $name, 'email' => $name.'@example.com', 'provider' => 'local', 'confirmed' => true, 'blocked' => false]);
        $user->assignRole('authenticated');
        // The login is a guest's: a token set by withToken() for an earlier request is not sent.
        $response = $this->withoutToken()->postJson('/api/auth/local', ['identifier' => $name.'@example.com', 'password' => 'password']);
        $response->assertOk();

        return (string) $response->json('jwt');
    }

    /** @param array<string, mixed> $data */
    private function create(string $token, array $data = []): TestResponse
    {
        return $this->withToken($token)->postJson('/api/properties', ['data' => $data + ['name' => 'Shop', 'domain' => 'shop.example.com']]);
    }

    public function test_a_create_without_a_key_succeeds_and_is_issued_a_strong_one(): void
    {
        $response = $this->create($this->signIn('alice'));
        $response->assertCreated();
        $key = (string) $response->json('data.ingestKey');
        $this->assertMatchesRegularExpression(self::STRONG_KEY, $key);
        $this->assertSame($key, Property::query()->sole()->ingest_key);
    }

    public function test_a_key_sent_on_create_is_ignored_so_two_owners_sending_one_value_both_succeed(): void
    {
        $alice = $this->create($this->signIn('alice'), ['ingestKey' => self::CHOSEN]);
        $mallory = $this->create($this->signIn('mallory'), ['ingestKey' => self::CHOSEN]);
        $alice->assertCreated();
        $mallory->assertCreated();
        $keys = [(string) $alice->json('data.ingestKey'), (string) $mallory->json('data.ingestKey')];
        $this->assertNotContains(self::CHOSEN, $keys);
        $this->assertNotSame($keys[0], $keys[1]);
        $this->assertSame(0, Property::query()->where('ingest_key', self::CHOSEN)->count());
    }

    public function test_an_update_cannot_change_or_clear_the_key_in_the_body_or_the_query(): void
    {
        $token = $this->signIn('alice');
        $created = $this->create($token);
        $documentId = (string) $created->json('data.documentId');
        $issued = (string) $created->json('data.ingestKey');
        foreach ([self::CHOSEN, null, ''] as $sent) {
            $this->withToken($token)->putJson('/api/properties/'.$documentId, ['data' => ['name' => 'Renamed', 'ingestKey' => $sent]])->assertOk();
        }
        $this->withToken($token)->putJson('/api/properties/'.$documentId.'?data[ingestKey]='.self::CHOSEN, ['data' => ['name' => 'Again']])->assertOk();
        $this->withToken($token)->putJson('/api/properties/'.$documentId.'?data[ingestKey]='.self::CHOSEN, [])->assertSuccessful();
        $property = Property::query()->sole();
        $this->assertSame($issued, $property->ingest_key);
        $this->assertSame('Again', $property->name);
    }

    public function test_a_key_taken_by_no_one_cannot_be_probed_through_the_unique_check(): void
    {
        $alice = $this->create($this->signIn('alice'))->assertCreated();
        // Sending Alice's own key on another create says nothing: it is dropped, and a fresh key issued.
        $probe = $this->create($this->signIn('mallory'), ['ingestKey' => (string) $alice->json('data.ingestKey')]);
        $probe->assertCreated();
        $this->assertNotSame($alice->json('data.ingestKey'), $probe->json('data.ingestKey'));
    }
}
