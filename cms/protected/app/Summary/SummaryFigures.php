<?php

declare(strict_types=1);

namespace App\Summary;

use UnexpectedValueException;

/**
 * The figures from the two counts of SummaryQueries: each bucket's row, the range before as bucket
 * -1, and the distinct sessions of each whole range. A bucket with no row is 0. The distinct
 * sessions of a range are counted over the range, not summed from its buckets, so a visitor seen in
 * two buckets counts once. The Strapi handler's src/summary/summary-figures.ts does the same.
 */
final class SummaryFigures
{
    /**
     * @param  iterable<array<string, mixed>|object>  $bucketRows
     * @param  array<string, mixed>|object|null  $visitorRow
     * @return array{visitors: array{value: int, previous: int, series: list<int>}, pageViews: array{value: int, previous: int, series: list<int>}, events: array{value: int, previous: int, series: list<int>}}
     */
    public static function of(SummaryWindow $window, iterable $bucketRows, array|object|null $visitorRow): array
    {
        $events = array_fill(0, $window->buckets, 0);
        $pageViews = $events;
        $visitors = $events;
        $previousEvents = 0;
        $previousPageViews = 0;
        foreach ($bucketRows as $row) {
            $row = (array) $row;
            $bucket = self::integer($row['bucket'] ?? null);
            if ($bucket === -1) {
                $previousEvents = self::count($row['events'] ?? null);
                $previousPageViews = self::count($row['page_views'] ?? null);

                continue;
            }
            if ($bucket === null || $bucket < 0 || $bucket >= $window->buckets) {
                throw new UnexpectedValueException('PropertySummary: the database answered a bucket outside the range');
            }
            $events[$bucket] = self::count($row['events'] ?? null);
            $pageViews[$bucket] = self::count($row['page_views'] ?? null);
            $visitors[$bucket] = self::count($row['visitors'] ?? null);
        }
        $visitorRow = (array) $visitorRow;

        return [
            'visitors' => [
                'value' => self::count($visitorRow['current_visitors'] ?? null),
                'previous' => self::count($visitorRow['previous_visitors'] ?? null),
                'series' => $visitors,
            ],
            'pageViews' => ['value' => array_sum($pageViews), 'previous' => $previousPageViews, 'series' => $pageViews],
            'events' => ['value' => array_sum($events), 'previous' => $previousEvents, 'series' => $events],
        ];
    }

    /** A whole number as a driver answers it (an int, or a string of digits on pgsql and MySQL). */
    private static function integer(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value;
        }
        if (is_string($value) && preg_match('/^-?[0-9]{1,18}$/', $value) === 1) {
            return (int) $value;
        }

        return null;
    }

    /** A count; a SUM over no row is null, which is 0. */
    private static function count(mixed $value): int
    {
        if ($value === null) {
            return 0;
        }
        $count = self::integer($value);
        if ($count === null || $count < 0) {
            throw new UnexpectedValueException('PropertySummary: the database answered a count that is not one');
        }

        return $count;
    }
}
