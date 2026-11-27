<?php

declare(strict_types=1);

namespace App\Ingest;

use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Exceptions\Handler;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use PDOException;

/**
 * A database failure on POST /api/ingest/events before the handler runs answers 503, which the SDK
 * retries, not camis' 400 "Validation failed", which it takes as final. camis' endpoint guard counts
 * the per-address throttle in the cache, which .env.example puts in the database, and its error
 * envelope (StrapiErrors) answers every QueryException 400. Registered from AppServiceProvider at
 * boot, so ahead of StrapiErrors' renderer, which it adds during each request; the first renderer to
 * answer wins. Logged by the exception's class alone: its message holds the query and bindings.
 * The handler's own database steps answer 503 themselves (IngestEvent::database).
 */
final class IngestDatabaseFailures
{
    public static function register(ExceptionHandler $handler): void
    {
        if (! $handler instanceof Handler) {
            return;
        }
        $handler->reportable(static function (QueryException|PDOException $error): ?bool {
            if (! self::onIngestion()) {
                return null;
            }
            Log::error('IngestEvent: the database failed before the handler ('.class_basename($error).'); answered 503');

            // False stops the default report, which would log the query and its bindings.
            return false;
        });
        $handler->renderable(static function (QueryException|PDOException $error, Request $request): ?JsonResponse {
            if (! self::onIngestion($request)) {
                return null;
            }

            return response()->json(['data' => null, 'error' => ['status' => 503, 'name' => 'ServiceUnavailableError', 'message' => 'Service Unavailable', 'details' => new \stdClass]], 503);
        });
    }

    private static function onIngestion(?Request $request = null): bool
    {
        $request ??= app()->bound('request') ? app('request') : null;

        return $request instanceof Request && $request->isMethod('POST') && $request->is('api/ingest/events');
    }
}
