<?php

declare(strict_types=1);

namespace App\Hooks;

use App\Hooks\Contracts\IssueIngestKeyHook;
use Illuminate\Support\Str;

/**
 * Ring 2 hook — hand-written, from the seed camis wrote. Runs before a Property is created (the
 * generated PropertyObserver); what it returns is written with it.
 */
final class IssueIngestKey implements IssueIngestKeyHook
{
    /** Random characters after pk_: 40 letters and digits (238 bits), within Property.ingestKey's 32 to 61. */
    public const RANDOM_LENGTH = 40;

    /** Ignores the key the client sent: a client never chooses its key. Str::random reads random_bytes. */
    public function run(array $input): array
    {
        return ['ingestKey' => 'pk_'.Str::random(self::RANDOM_LENGTH)];
    }
}
