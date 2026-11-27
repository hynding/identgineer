<?php

declare(strict_types=1);

namespace App\Ingest;

use App\Models\Property;

/** What a property lets its key send, read from the property's components. */
final class IngestPolicy
{
    /**
     * @param  list<string>  $allowedOrigins
     * @param  array<string, list<string>>  $allowedEvents  event name to the property keys it keeps
     * @param  list<string>  $allowedQueryParams
     */
    public function __construct(
        public readonly array $allowedOrigins,
        public readonly array $allowedEvents,
        public readonly array $allowedQueryParams,
    ) {}

    /** The relations fromProperty() reads, to load with the property in one go. */
    public const RELATIONS = ['allowedOrigins', 'allowedEvents.propertyKeys', 'allowedQueryParams'];

    public static function fromProperty(Property $property): self
    {
        $events = [];
        foreach ($property->allowedEvents as $allowed) {
            $events[(string) $allowed->name] = $allowed->propertyKeys->pluck('key')->map(static fn (mixed $key): string => (string) $key)->values()->all();
        }

        return new self(
            $property->allowedOrigins->pluck('origin')->map(static fn (mixed $origin): string => (string) $origin)->values()->all(),
            $events,
            $property->allowedQueryParams->pluck('name')->map(static fn (mixed $name): string => (string) $name)->values()->all(),
        );
    }
}
