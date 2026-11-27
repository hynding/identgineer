<?php

declare(strict_types=1);

// Runs strapi-php's validator and normaliser (cms/protected/app/Ingest) on the shared vector files
// with plain PHP, outside a Laravel app, and prints what they answered as JSON for
// ingest-php-vectors.test.ts to compare. Only the classes that need no framework are loaded.
// Usage: php ingest-php-vectors.php <batch-vectors.json> <ingest-normalise-vectors.json>

$ingest = __DIR__.'/../protected/app/Ingest';
require $ingest.'/InvalidTrackingBatch.php';
require $ingest.'/TrackingBatch.php';
require $ingest.'/IngestedEvent.php';

use App\Ingest\IngestedEvent;
use App\Ingest\InvalidTrackingBatch;
use App\Ingest\TrackingBatch;

$read = static fn (string $path): array => json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
$batchVectors = $read($argv[1]);
$normaliseVectors = $read($argv[2]);

$batches = [];
foreach ($batchVectors['vectors'] as $vector) {
    try {
        TrackingBatch::parse((string) $vector['body']);
        $accepted = true;
    } catch (InvalidTrackingBatch) {
        $accepted = false;
    }
    $batches[] = ['name' => $vector['name'], 'accepted' => $accepted];
}

$paths = array_map(
    static fn (array $vector): ?string => IngestedEvent::path((string) $vector['path'], $vector['allowed']),
    $normaliseVectors['paths'],
);
$referrers = array_map(
    static fn (array $vector): ?string => IngestedEvent::referrerHost((string) $vector['referrer']),
    $normaliseVectors['referrers'],
);

$times = array_map(
    static fn (array $vector): ?int => IngestedEvent::occurredAtMs((int) $vector['at'], (int) $vector['sentAt'], (int) $vector['now']),
    $normaliseVectors['times'],
);

echo json_encode([
    'php' => PHP_VERSION,
    'counts' => ['batches' => count($batchVectors['vectors']), 'paths' => count($normaliseVectors['paths']), 'referrers' => count($normaliseVectors['referrers']), 'times' => count($normaliseVectors['times'])],
    'batches' => $batches,
    'paths' => $paths,
    'referrers' => $referrers,
    'times' => $times,
    'dedupeKey' => IngestedEvent::dedupeKey(7, 'AAAAAAAAAAAAAAAAAAAAAA'),
], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
