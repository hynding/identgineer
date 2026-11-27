<?php

declare(strict_types=1);

namespace App\Summary;

/**
 * The time the property summary covers, in epoch milliseconds, each part half-open ([from, to)):
 * the range ends where the UTC hour (24h) or day (7d, 30d) that holds now ends, so its last bucket
 * is the one in progress, and the range before it is as long and ends where the range starts. The
 * same as the Strapi handler's src/summary/summary-window.ts; both are held to
 * cms/tests/fixtures/property-summary-vectors.json. Unix time has no leap seconds, so a multiple
 * of an hour or a day from the epoch starts a UTC hour or day.
 */
final class SummaryWindow
{
    public const RANGES = ['24h', '7d', '30d'];

    private const HOUR_MS = 3_600_000;

    private const DAY_MS = 86_400_000;

    private function __construct(
        public readonly string $range,
        public readonly int $bucketMs,
        public readonly int $buckets,
        public readonly int $previousStart,
        public readonly int $start,
        public readonly int $end,
    ) {}

    public static function isRange(mixed $value): bool
    {
        return is_string($value) && in_array($value, self::RANGES, true);
    }

    public static function of(int $nowMs, string $range): self
    {
        [$size, $count] = match ($range) {
            '24h' => [self::HOUR_MS, 24],
            '7d' => [self::DAY_MS, 7],
            '30d' => [self::DAY_MS, 30],
        };
        $end = intdiv($nowMs, $size) * $size + $size;
        $start = $end - $count * $size;

        return new self($range, $size, $count, $start - $count * $size, $start, $end);
    }

    /**
     * Where each bucket of the range starts after the first, oldest first: the CASE edges.
     *
     * @return list<int>
     */
    public function edges(): array
    {
        $edges = [];
        for ($index = 1; $index < $this->buckets; $index++) {
            $edges[] = $this->start + $index * $this->bucketMs;
        }

        return $edges;
    }
}
