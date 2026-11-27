<?php

declare(strict_types=1);

namespace App\Hooks;

use App\Hooks\Contracts\DropClientIngestKeyMiddleware;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ring 2 middleware — hand-written, from the seed camis wrote. Runs around Property's create and
 * update routes (CamisRouteHooks), after their policies and before the controller validates the
 * body. A property's ingest key is the server's: IssueIngestKey issues it on create, and nothing a
 * client sends may set or change it, so a key in the body's data is dropped before validation (a
 * unique check on a client's value would tell whether that key exists).
 */
final class DropClientIngestKey implements DropClientIngestKeyMiddleware
{
    private const FIELD = 'ingestKey';

    public function handle(Request $request, Closure $next): Response
    {
        // input() reads the body (JSON or form) and then the query string, the body first; merge()
        // writes the body, so a key sent in either is gone for the controller, which reads input().
        $data = $request->input('data');
        if (is_array($data) && array_key_exists(self::FIELD, $data)) {
            unset($data[self::FIELD]);
            $request->merge(['data' => $data]);
        }

        return $next($request);
    }
}
