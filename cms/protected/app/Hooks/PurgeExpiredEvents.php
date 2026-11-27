<?php

declare(strict_types=1);

namespace App\Hooks;

use App\Hooks\Contracts\PurgeExpiredEventsTask;
use App\Models\Event;
use App\Models\Property;
use Illuminate\Support\Carbon;

/**
 * Ring 2 scheduled task — hand-written, from the seed camis wrote. Runs on the cron schedule
 * "17 3 * * *" (cron calls `php artisan schedule:run`): each property's events older than its
 * retentionDays are deleted, in one statement a property, so no row is loaded.
 */
final class PurgeExpiredEvents implements PurgeExpiredEventsTask
{
    public function run(): void
    {
        $now = Carbon::now('UTC');
        Property::query()->select(['id', 'retention_days'])->orderBy('id')->each(static function (Property $property) use ($now): void {
            Event::query()
                ->where('property_id', $property->getKey())
                ->where('occurred_at', '<', $now->copy()->subDays(max(1, (int) $property->retention_days)))
                ->delete();
        });
    }
}
