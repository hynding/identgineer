<?php

declare(strict_types=1);

/*
 * The event ingestion handler's limits (app/Hooks/IngestEvent.php), from the environment
 * (cms/.env.example). Read here, not in the handler, so `php artisan config:cache` keeps them. A
 * whole number in ASCII digits (at most 15) is read, floored at 1; anything else keeps the default,
 * as the Strapi handler reads them. Strapi never loads this file: its config loader reads only
 * JavaScript, TypeScript and JSON.
 */
$wholeNumber = static fn (mixed $value, int $default): int => is_string($value) && preg_match('/\A[0-9]{1,15}\z/', $value) === 1 ? max(1, (int) $value) : $default;

return [
    // At most the wire format's cap, 65536 bytes, which the endpoint's declared guard enforces first.
    'max_body_bytes' => min(65536, $wholeNumber(env('INGEST_MAX_BODY_BYTES'), 65536)),
    // Requests a minute per property key, from every address together.
    'key_rate_per_minute' => $wholeNumber(env('INGEST_KEY_RATE_PER_MINUTE'), 3000),
];
