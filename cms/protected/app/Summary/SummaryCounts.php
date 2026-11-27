<?php

declare(strict_types=1);

namespace App\Summary;

/**
 * Runs the two counts of SummaryQueries on a database connection and makes the figures of them.
 * The SQL's dialect follows the connection's own driver (MySQL and MariaDB compare sessions by their
 * bytes), and the table takes the connection's prefix. Kept apart from the hook, and free of
 * Laravel's types, so plain PHP can run it on a stand-in connection (cms/tests/summary-php-vectors.php).
 */
final class SummaryCounts
{
    /**
     * @param  \Illuminate\Database\Connection  $connection  or anything with its getDriverName, getTablePrefix and select
     * @return array{visitors: array{value: int, previous: int, series: list<int>}, pageViews: array{value: int, previous: int, series: list<int>}, events: array{value: int, previous: int, series: list<int>}}
     */
    public static function of(SummaryWindow $window, object $connection, string $table, int $propertyId): array
    {
        $queries = SummaryQueries::for($window, $connection->getTablePrefix().$table, $propertyId, $connection->getDriverName());
        $buckets = $connection->select($queries['buckets']['sql'], $queries['buckets']['bindings']);
        $visitors = $connection->select($queries['visitors']['sql'], $queries['visitors']['bindings']);

        return SummaryFigures::of($window, $buckets, $visitors[0] ?? null);
    }
}
