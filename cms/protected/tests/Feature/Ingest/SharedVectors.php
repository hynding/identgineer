<?php

declare(strict_types=1);

namespace Tests\Feature\Ingest;

use RuntimeException;

/**
 * The vector files this repository shares between the TypeScript tests and these, named by the
 * environment (cms/scripts/live-backend.js sets both), so the PHP handler is held to the same answers.
 */
final class SharedVectors
{
    /** @return array<string, mixed> */
    public static function load(string $variable): array
    {
        $path = getenv($variable);
        if (! is_string($path) || $path === '' || ! is_file($path)) {
            throw new RuntimeException("{$variable} must name the shared vector file; run these tests through pnpm contract:live.");
        }
        $decoded = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($decoded)) {
            throw new RuntimeException("{$path} does not hold an object");
        }

        return $decoded;
    }
}
