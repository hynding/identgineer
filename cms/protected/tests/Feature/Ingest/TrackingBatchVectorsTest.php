<?php

declare(strict_types=1);

namespace Tests\Feature\Ingest;

use App\Ingest\InvalidTrackingBatch;
use App\Ingest\TrackingBatch;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** The PHP validator against packages/tracking/src/testing/batch-vectors.json, as parseTrackingBatch answers. */
final class TrackingBatchVectorsTest extends TestCase
{
    /** @return iterable<string, array{string, bool}> */
    public static function vectors(): iterable
    {
        foreach (SharedVectors::load('TRACKING_BATCH_VECTORS')['vectors'] as $vector) {
            yield (string) $vector['name'] => [(string) $vector['body'], (bool) $vector['valid']];
        }
    }

    #[DataProvider('vectors')]
    public function test_it_agrees_with_the_shared_vector(string $body, bool $valid): void
    {
        try {
            TrackingBatch::parse($body);
            $accepted = true;
        } catch (InvalidTrackingBatch) {
            $accepted = false;
        }
        $this->assertSame($valid, $accepted);
    }

    public function test_it_names_the_field_and_the_rule(): void
    {
        $this->expectExceptionObject(new InvalidTrackingBatch('events[0].ip: is not allowed'));
        TrackingBatch::parse('{"v":1,"sentAt":1,"transport":"fetch","events":[{"id":"AAAAAAAAAAAAAAAAAAAAAA","name":"a","at":1,"ip":"1.2.3.4"}]}');
    }

    public function test_it_refuses_invalid_utf8(): void
    {
        $this->expectException(InvalidTrackingBatch::class);
        TrackingBatch::parse("{\"v\":1,\"sentAt\":1,\"transport\":\"fetch\",\"events\":[{\"id\":\"AAAAAAAAAAAAAAAAAAAAAA\",\"name\":\"a\",\"at\":1,\"properties\":{\"a\":\"\xC3\x28\"}}]}");
    }

    public function test_it_refuses_a_body_over_the_cap_before_decoding_it(): void
    {
        $this->expectExceptionObject(new InvalidTrackingBatch('body: 65537 bytes exceed the cap of 65536 bytes'));
        TrackingBatch::parse(str_repeat(' ', 65537));
    }

    public function test_it_returns_the_batch_with_whole_numbers(): void
    {
        $batch = TrackingBatch::parse('{"v":1.0,"sentAt":17E11,"transport":"beacon","writeKey":"kkkkkkkkkkkkkkkk","events":[{"id":"AAAAAAAAAAAAAAAAAAAAAA","name":"a","at":-0,"user":"u_1","properties":{"n":1.5}}]}');
        $this->assertSame([
            'sentAt' => 1700000000000,
            'transport' => 'beacon',
            'writeKey' => 'kkkkkkkkkkkkkkkk',
            'events' => [[
                'id' => 'AAAAAAAAAAAAAAAAAAAAAA',
                'name' => 'a',
                'at' => 0,
                'session' => null,
                'path' => null,
                'referrer' => null,
                'properties' => ['n' => 1.5],
            ]],
        ], $batch);
    }
}
