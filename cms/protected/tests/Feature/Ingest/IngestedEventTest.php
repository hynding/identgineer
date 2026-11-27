<?php

declare(strict_types=1);

namespace Tests\Feature\Ingest;

use App\Ingest\IngestedEvent;
use App\Ingest\IngestPolicy;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** What an event is stored as, against cms/tests/fixtures/ingest-normalise-vectors.json, as the Strapi handler stores it. */
final class IngestedEventTest extends TestCase
{
    private const NOW = 1800000000000;

    private const HOUR = 3600000;

    /** @return iterable<string, array{string, list<string>, string}> */
    public static function paths(): iterable
    {
        foreach (SharedVectors::load('INGEST_NORMALISE_VECTORS')['paths'] as $index => $vector) {
            yield $index.': '.$vector['path'].' keeping '.implode(',', $vector['allowed']) => [(string) $vector['path'], array_map('strval', $vector['allowed']), (string) $vector['stored']];
        }
    }

    /** @return iterable<string, array{string, ?string}> */
    public static function referrers(): iterable
    {
        foreach (SharedVectors::load('INGEST_NORMALISE_VECTORS')['referrers'] as $vector) {
            yield (string) $vector['referrer'] => [(string) $vector['referrer'], $vector['stored']];
        }
    }

    /** @return iterable<string, array{int, int, int, ?int}> */
    public static function times(): iterable
    {
        foreach (SharedVectors::load('INGEST_NORMALISE_VECTORS')['times'] as $vector) {
            yield (string) $vector['name'] => [(int) $vector['at'], (int) $vector['sentAt'], (int) $vector['now'], $vector['stored']];
        }
    }

    #[DataProvider('times')]
    public function test_an_events_corrected_time_is_kept_inside_the_window(int $at, int $sentAt, int $now, ?int $stored): void
    {
        $this->assertSame($stored, IngestedEvent::occurredAtMs($at, $sentAt, $now));
    }

    /** @param list<string> $allowed */
    #[DataProvider('paths')]
    public function test_a_path_keeps_only_the_allowed_query_parameters(string $path, array $allowed, string $stored): void
    {
        $this->assertSame($stored, IngestedEvent::path($path, $allowed));
    }

    #[DataProvider('referrers')]
    public function test_a_referrer_is_stored_as_its_host_only(string $referrer, ?string $stored): void
    {
        $this->assertSame($stored, IngestedEvent::referrerHost($referrer));
    }

    public function test_the_dedupe_key_is_the_sha256_of_the_property_and_event_ids(): void
    {
        // The value cms/tests/ingest-normalise.test.ts expects of the Strapi handler, for the same ids.
        $this->assertSame('8d843a1ceb571c66e03617ae03248b8440bf598a58914236a75b24ed41084031', IngestedEvent::dedupeKey(7, 'AAAAAAAAAAAAAAAAAAAAAA'));
    }

    public function test_an_event_becomes_its_row_without_the_visitors_id(): void
    {
        $policy = new IngestPolicy(['https://shop.example.com'], ['signup_completed' => ['plan'], 'clicked' => []], ['utm_source']);
        $event = [
            'id' => 'AAAAAAAAAAAAAAAAAAAAAA',
            'name' => 'signup_completed',
            'at' => self::NOW - 1000,
            'session' => 'SSSSSSSSSSSSSSSSSSSSSS',
            'path' => '/p?utm_source=x&email=y',
            'referrer' => 'https://News.example.org',
            'properties' => ['plan' => 'pro', 'email' => 'a@b.c'],
        ];
        $row = IngestedEvent::row($event, 7, self::NOW, self::NOW, $policy);
        $this->assertNotNull($row);
        $this->assertSame(self::NOW - 1000, $row['occurred_at']->getTimestampMs());
        unset($row['occurred_at']);
        $this->assertSame([
            'name' => 'signup_completed',
            'dedupe_key' => IngestedEvent::dedupeKey(7, 'AAAAAAAAAAAAAAAAAAAAAA'),
            'session_id' => 'SSSSSSSSSSSSSSSSSSSSSS',
            'path' => '/p?utm_source=x',
            'referrer_host' => 'news.example.org',
            'properties' => ['plan' => 'pro'],
        ], $row);

        $this->assertNull(IngestedEvent::row(['name' => 'other'] + $event, 7, self::NOW, self::NOW, $policy), 'an unlisted event');
        $this->assertNull(IngestedEvent::row(['at' => self::NOW - 26 * self::HOUR] + $event, 7, self::NOW, self::NOW, $policy), 'too old');
        $this->assertNull(IngestedEvent::row(['name' => 'page_view'] + $event, 7, self::NOW, self::NOW, $policy)['properties'] ?? null);
        $this->assertNull(IngestedEvent::row(['name' => 'clicked'] + $event, 7, self::NOW, self::NOW, $policy)['properties'] ?? null);
        $this->assertNull(IngestedEvent::row(['properties' => ['email' => 'x']] + $event, 7, self::NOW, self::NOW, $policy)['properties'] ?? null);
    }
}
