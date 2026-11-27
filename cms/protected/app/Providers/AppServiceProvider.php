<?php

declare(strict_types=1);

namespace App\Providers;

use App\Ingest\IngestDatabaseFailures;
use App\Summary\SummaryNoStore;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Foundation\Http\Kernel as HttpKernel;
use Illuminate\Support\ServiceProvider;

/**
 * The Laravel app's own provider, which camis neither generates nor seeds (Laravel's skeleton has an
 * empty one, first in bootstrap/providers.php). Kept here so it survives a fresh scaffold; inert in
 * the Strapi project, as every PHP file here is.
 */
class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        IngestDatabaseFailures::register($this->app->make(ExceptionHandler::class));
        $kernel = $this->app->make(Kernel::class);
        if ($kernel instanceof HttpKernel) {
            $kernel->prependMiddleware(SummaryNoStore::class);
        }
    }
}
