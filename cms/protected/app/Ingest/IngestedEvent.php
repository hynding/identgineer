<?php

declare(strict_types=1);

namespace App\Ingest;

use Illuminate\Support\Carbon;

/**
 * What an accepted event is stored as, as the Strapi handler stores it
 * (src/ingest/normalise.ts; tests/Feature/Ingest holds both to shared vectors).
 */
final class IngestedEvent
{
    /** The event page() records: always accepted, never with properties of its own. */
    public const PAGE_VIEW = 'page_view';

    public const MAX_AGE_MS = 25 * 60 * 60 * 1000;

    public const MAX_LEAD_MS = 5 * 60 * 1000;

    // Event.referrerHost in camis.json: a host name with a top-level domain, never an address.
    private const HOST_PATTERN = '/\A([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\z/';

    /** The SHA-256 of the property's id and the event's id, in hex: Event.dedupeKey. */
    public static function dedupeKey(int $propertyId, string $eventId): string
    {
        return hash('sha256', $propertyId.':'.$eventId);
    }

    /** The event's time on the server's clock, at + (now - sentAt), or null outside 25 hours back to 5 minutes ahead. */
    public static function occurredAtMs(int $at, int $sentAt, int $nowMs): ?int
    {
        $corrected = $at + ($nowMs - $sentAt);

        return $corrected < $nowMs - self::MAX_AGE_MS || $corrected > $nowMs + self::MAX_LEAD_MS ? null : $corrected;
    }

    /**
     * The path with only the allowed query parameters, compared by name as sent, in their order; the
     * fragment is always dropped.
     *
     * @param  list<string>  $allowed
     */
    public static function path(string $path, array $allowed): string
    {
        $withoutFragment = explode('#', $path, 2)[0];
        $mark = strpos($withoutFragment, '?');
        if ($mark === false) {
            return $withoutFragment;
        }
        $kept = array_values(array_filter(
            explode('&', substr($withoutFragment, $mark + 1)),
            static fn (string $pair): bool => $pair !== '' && in_array(explode('=', $pair, 2)[0], $allowed, true),
        ));
        $base = substr($withoutFragment, 0, $mark);

        return $kept === [] ? $base : $base.'?'.implode('&', $kept);
    }

    /** The referring origin's host in lower case, or null for an address, a bare name or a port alone. */
    public static function referrerHost(string $referrer): ?string
    {
        $authority = (string) preg_replace('/\Ahttps?:\/\//', '', $referrer);
        if (str_starts_with($authority, '[')) {
            return null;
        }
        $host = strtolower((string) preg_replace('/:[0-9]*\z/', '', $authority));

        return strlen($host) <= 253 && preg_match(self::HOST_PATTERN, $host) === 1 ? $host : null;
    }

    /**
     * The row an accepted event becomes (without its property and owner), or null when it is
     * skipped: not allowed, or outside the time window. The visitor's user id is never kept.
     *
     * @param  array{id: string, name: string, at: int, session: ?string, path: ?string, referrer: ?string, properties: ?array<string, string|int|float|bool>}  $event
     * @return array{name: string, dedupe_key: string, occurred_at: Carbon, session_id: ?string, path: ?string, referrer_host: ?string, properties: ?array<string, string|int|float|bool>}|null
     */
    public static function row(array $event, int $propertyId, int $sentAt, int $nowMs, IngestPolicy $policy): ?array
    {
        $occurredAt = self::occurredAtMs($event['at'], $sentAt, $nowMs);
        if ($occurredAt === null) {
            return null;
        }
        if ($event['name'] === self::PAGE_VIEW) {
            $properties = null;
        } elseif (array_key_exists($event['name'], $policy->allowedEvents)) {
            $kept = array_intersect_key($event['properties'] ?? [], array_flip($policy->allowedEvents[$event['name']]));
            $properties = $kept === [] ? null : $kept;
        } else {
            return null;
        }

        return [
            'name' => $event['name'],
            'dedupe_key' => self::dedupeKey($propertyId, $event['id']),
            'occurred_at' => Carbon::createFromTimestampMs($occurredAt, 'UTC'),
            'session_id' => $event['session'],
            'path' => $event['path'] === null ? null : self::path($event['path'], $policy->allowedQueryParams),
            'referrer_host' => $event['referrer'] === null ? null : self::referrerHost($event['referrer']),
            'properties' => $properties,
        ];
    }
}
