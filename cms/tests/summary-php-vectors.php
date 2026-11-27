<?php

declare(strict_types=1);

// Runs strapi-php's property summary (cms/protected/app/Summary) on the shared vectors with plain
// PHP, outside a Laravel app: each vector's events go into an sqlite table shaped as the generated
// migration makes `events` (occurred_at a datetime column, stored as the Event model writes it),
// then the two queries the handler sends run on it. Prints each vector's figures as JSON for
// summary-php-vectors.test.ts to compare.
// Usage: php summary-php-vectors.php <property-summary-vectors.json>

$summary = __DIR__.'/../protected/app/Summary';
require $summary.'/SummaryWindow.php';
require $summary.'/SummaryQueries.php';
require $summary.'/SummaryFigures.php';

use App\Summary\SummaryFigures;
use App\Summary\SummaryQueries;
use App\Summary\SummaryWindow;

const PROPERTY = 3;
const OTHER_PROPERTY = 4;

$vectors = json_decode((string) file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR)['vectors'];

$answers = [];
foreach ($vectors as $vector) {
    $pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec('CREATE TABLE events (id integer primary key autoincrement not null, name varchar not null, occurred_at datetime not null, session_id varchar, property_id integer not null)');
    $insert = $pdo->prepare('INSERT INTO events (name, occurred_at, session_id, property_id) VALUES (?, ?, ?, ?)');
    foreach ($vector['events'] as $event) {
        $ms = (int) round((new DateTimeImmutable($event['occurredAt']))->format('U.u') * 1000);
        $insert->execute([$event['name'], SummaryQueries::time($ms), $event['sessionId'], ($event['other'] ?? false) ? OTHER_PROPERTY : PROPERTY]);
    }
    $nowMs = (int) round((new DateTimeImmutable($vector['now']))->format('U.u') * 1000);
    $window = SummaryWindow::of($nowMs, $vector['range']);
    $queries = SummaryQueries::for($window, 'events', PROPERTY, 'sqlite');
    $buckets = $pdo->prepare($queries['buckets']['sql']);
    $buckets->execute($queries['buckets']['bindings']);
    $visitors = $pdo->prepare($queries['visitors']['sql']);
    $visitors->execute($queries['visitors']['bindings']);
    $answers[] = ['name' => $vector['name'], 'figures' => SummaryFigures::of($window, $buckets->fetchAll(), $visitors->fetch() ?: null)];
}

// The SQL each Laravel driver is sent, for the same window, so the test can compare the dialects.
$window = SummaryWindow::of(0, '7d');
$sql = [];
foreach (['sqlite', 'pgsql', 'mysql', 'mariadb'] as $driver) {
    $queries = SummaryQueries::for($window, 'events', PROPERTY, $driver);
    $sql[$driver] = ['buckets' => $queries['buckets']['sql'], 'visitors' => $queries['visitors']['sql']];
}

echo json_encode(['php' => PHP_VERSION, 'answers' => $answers, 'sql' => $sql], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
