<?php

declare(strict_types=1);

namespace App\Ingest;

use RuntimeException;

/** A request body the wire format refuses; the message names the field and the rule. */
final class InvalidTrackingBatch extends RuntimeException {}
