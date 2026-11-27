<?php

declare(strict_types=1);

namespace App\Summary;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cache-Control: no-store on every answer of GET /api/properties/:id/summary, the refusals camis
 * makes before the handler included (401 for a bad token, 403 without a session, 429 past the
 * throttle), which Laravel would otherwise send as "no-cache, private". The handler sets it on its
 * own answers too. Registered as global middleware from the protected AppServiceProvider, so it
 * wraps camis' route middleware without changing it.
 */
final class SummaryNoStore
{
    private const PATH = '#^api/properties/[^/]+/summary$#';

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        if ($response instanceof Response && preg_match(self::PATH, $request->path()) === 1) {
            $response->headers->set('Cache-Control', 'no-store');
        }

        return $response;
    }
}
