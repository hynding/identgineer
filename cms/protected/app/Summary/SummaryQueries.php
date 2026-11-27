<?php

declare(strict_types=1);

namespace App\Summary;

use InvalidArgumentException;

/**
 * The two grouped counts that make a property summary, over at most twice the range and without
 * loading a row: each bucket's events, page views and distinct sessions (bucket -1 is the range
 * before), and the distinct sessions of each whole range. A bucket is chosen by comparing the time
 * with the buckets' edges (CASE), which sqlite, MySQL and PostgreSQL run alike; no date function
 * is used. The CASE is grouped from a derived table by its alias, as PostgreSQL refuses to group by
 * an expression whose parameters are bound twice. Times are bound in the form the Event model
 * stores them (UTC, Y-m-d H:i:s.v), so they compare as the stored values do on every database, as
 * text on sqlite too. The Strapi handler's src/summary/summary-sql.ts is the same query over
 * Strapi's tables.
 */
final class SummaryQueries
{
    public const DATE_FORMAT = 'Y-m-d H:i:s.v';

    // The table's name is written into the SQL unquoted, so anything a dialect would need quoted
    // is refused rather than quoted.
    private const IDENTIFIER = '/^[a-z_][a-z0-9_]{0,62}$/';

    public static function time(int $ms): string
    {
        $seconds = intdiv($ms, 1000);
        $milliseconds = $ms - $seconds * 1000;
        if ($milliseconds < 0) {
            $seconds--;
            $milliseconds += 1000;
        }

        return gmdate('Y-m-d H:i:s', $seconds).sprintf('.%03d', $milliseconds);
    }

    /**
     * @return array{buckets: array{sql: string, bindings: list<int|string>}, visitors: array{sql: string, bindings: list<int|string>}}
     */
    public static function for(SummaryWindow $window, string $table, int $propertyId, string $driver): array
    {
        if (preg_match(self::IDENTIFIER, $table) !== 1) {
            throw new InvalidArgumentException('PropertySummary: unexpected events table name');
        }
        // MySQL and MariaDB compare text in the column's collation, which by default folds case,
        // and session ids are base64url, where "aB" and "Ab" are two sessions: there the bytes are
        // compared. sqlite and PostgreSQL compare text byte for byte already.
        $session = in_array($driver, ['mysql', 'mariadb'], true) ? 'CAST(session_id AS BINARY)' : 'session_id';
        $from = "FROM {$table} WHERE property_id = ? AND occurred_at >= ? AND occurred_at < ?";
        $scope = [$propertyId, self::time($window->previousStart), self::time($window->end)];
        $edges = $window->edges();
        $cases = implode(' ', array_map(
            static fn (int $index): string => "WHEN occurred_at < ? THEN {$index}",
            array_keys($edges),
        ));
        $last = $window->buckets - 1;
        $bucket = "CASE WHEN occurred_at < ? THEN -1 {$cases} ELSE {$last} END";

        return [
            'buckets' => [
                'sql' => 'SELECT bucketed.bucket AS bucket, COUNT(*) AS events, '
                    .'SUM(CASE WHEN bucketed.name = ? THEN 1 ELSE 0 END) AS page_views, '
                    .'COUNT(DISTINCT bucketed.session_id) AS visitors '
                    ."FROM (SELECT {$bucket} AS bucket, name, {$session} AS session_id {$from}) AS bucketed "
                    .'GROUP BY bucketed.bucket',
                'bindings' => ['page_view', self::time($window->start), ...array_map(self::time(...), $edges), ...$scope],
            ],
            'visitors' => [
                'sql' => "SELECT COUNT(DISTINCT CASE WHEN occurred_at >= ? THEN {$session} END) AS current_visitors, "
                    ."COUNT(DISTINCT CASE WHEN occurred_at < ? THEN {$session} END) AS previous_visitors {$from}",
                'bindings' => [self::time($window->start), self::time($window->start), ...$scope],
            ],
        ];
    }
}
