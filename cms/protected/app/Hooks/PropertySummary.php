<?php

declare(strict_types=1);

namespace App\Hooks;

use App\Hooks\Contracts\PropertySummaryEndpoint;
use App\Models\Event;
use App\Models\Property;
use App\Models\User;
use App\Summary\SummaryFigures;
use App\Summary\SummaryQueries;
use App\Summary\SummaryWindow;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use PDOException;
use Throwable;
use UnexpectedValueException;

/**
 * Ring 2 endpoint — hand-written, from the seed camis wrote. GET /api/properties/:id/summary, not
 * public: camis' route has checked the caller's credentials, the declared throttle and that the
 * caller's role lists the endpoint (roles.json: authenticated only) before this runs.
 *
 * The handler is the ownership check. In this order: a range other than 24h, 7d or 30d, or one
 * sent more than once, is 400 before any lookup; a caller without a user (an API token, which the
 * route lets through) is 403; then one query asks for the property by its document id and the
 * caller as owner, so a property that does not exist and one that is someone else's are both 404,
 * with the same body, after the same work. Then two grouped counts (App\Summary\SummaryQueries)
 * make the figures, without loading an event. Every answer of the handler carries
 * Cache-Control: no-store. A database failure is 503, logged by the error's class alone: its
 * message holds the query and its bindings. No event text is read, so none can be logged.
 */
final class PropertySummary implements PropertySummaryEndpoint
{
    // What a document id is made of on both targets; anything else names no property.
    private const DOCUMENT_ID = '/^[A-Za-z0-9_-]{1,128}$/';

    public function handle(Request $request): mixed
    {
        $range = self::range($request);
        if ($range === null) {
            return self::refusal(400, 'ValidationError', 'range must be 24h, 7d or 30d');
        }
        $user = $request->user();
        if (! $user instanceof User) {
            return self::refusal(403, 'ForbiddenError', 'Forbidden');
        }
        $documentId = $request->route('id');
        if (! is_string($documentId) || preg_match(self::DOCUMENT_ID, $documentId) !== 1) {
            return self::refusal(404, 'NotFoundError', 'Not Found');
        }
        try {
            $property = Property::query()
                ->where('document_id', $documentId)
                ->where('owner_id', $user->getKey())
                ->first(['id']);
        } catch (QueryException|PDOException $error) {
            return self::unavailable('lookup', $error);
        }
        if (! $property instanceof Property) {
            return self::refusal(404, 'NotFoundError', 'Not Found');
        }
        $window = SummaryWindow::of(Carbon::now('UTC')->getTimestampMs(), $range);
        try {
            $figures = self::figures($window, (int) $property->getKey());
        } catch (QueryException|PDOException|UnexpectedValueException $error) {
            return self::unavailable('count', $error);
        }

        return new JsonResponse(
            ['data' => ['propertyId' => $documentId, 'range' => $range] + $figures],
            200,
            ['Cache-Control' => 'no-store'],
        );
    }

    /**
     * The query's one range, read from the query string itself: PHP keeps the last of a repeated
     * key, where Strapi's parser makes a list of them and refuses it, so both targets refuse a
     * range sent twice (or as range[]).
     */
    private static function range(Request $request): ?string
    {
        $values = [];
        foreach (explode('&', (string) $request->server('QUERY_STRING', '')) as $pair) {
            $name = urldecode(explode('=', $pair, 2)[0]);
            if (str_starts_with($name, 'range[')) {
                return null;
            }
            if ($name === 'range') {
                $values[] = urldecode(explode('=', $pair, 2)[1] ?? '');
            }
        }
        if (count($values) !== 1 || ! SummaryWindow::isRange($values[0])) {
            return null;
        }

        return $values[0];
    }

    /** @return array{visitors: array{value: int, previous: int, series: list<int>}, pageViews: array{value: int, previous: int, series: list<int>}, events: array{value: int, previous: int, series: list<int>}} */
    private static function figures(SummaryWindow $window, int $propertyId): array
    {
        $model = new Event;
        $connection = $model->getConnection();
        $queries = SummaryQueries::for($window, $connection->getTablePrefix().$model->getTable(), $propertyId, $connection->getDriverName());
        $buckets = $connection->select($queries['buckets']['sql'], $queries['buckets']['bindings']);
        $visitors = $connection->select($queries['visitors']['sql'], $queries['visitors']['bindings']);

        return SummaryFigures::of($window, $buckets, $visitors[0] ?? null);
    }

    /**
     * A database failure (or a count the database answered that is not one): 503, logged by the
     * exception's class only, never its message, which holds the query and its bindings.
     */
    private static function unavailable(string $stage, Throwable $error): JsonResponse
    {
        Log::error('PropertySummary: the database failed at the '.$stage.' ('.class_basename($error).'); answered 503');

        return self::refusal(503, 'ServiceUnavailableError', 'Service Unavailable');
    }

    private static function refusal(int $status, string $name, string $message): JsonResponse
    {
        return new JsonResponse(
            ['data' => null, 'error' => ['status' => $status, 'name' => $name, 'message' => $message, 'details' => (object) []]],
            $status,
            ['Cache-Control' => 'no-store'],
        );
    }
}
