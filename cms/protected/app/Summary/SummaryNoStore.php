<?php

declare(strict_types=1);

namespace App\Summary;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cache-Control: no-store on every answer of GET /api/properties/:id/summary, the refusals camis
 * makes before the handler included (401 for a bad token, 403 without a session, 429 past the
 * throttle), which Laravel would otherwise send as "no-cache, private". The handler sets it on its
 * own answers too. Registered as global middleware from the protected AppServiceProvider, so it
 * wraps camis' route middleware without changing it. It asks which route the router matched, not
 * how the path was spelt, since the router matches the decoded path (`summar%79` and `%2Fsummary`
 * reach the summary too); the route is known by the time camis' route middleware refuses.
 */
final class SummaryNoStore
{
    private const URI = 'api/properties/{id}/summary';

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $route = $request->route();
        if ($response instanceof Response && $route instanceof Route && $route->uri() === self::URI) {
            $response->headers->set('Cache-Control', 'no-store');
        }

        return $response;
    }
}
