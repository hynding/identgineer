import { h, type FunctionalComponent } from "@stencil/core";
import { templateParts } from "./labels";
import { MAX_PASSWORD_BYTES } from "./password-bytes";

/**
 * How much of the limit a new password uses, in bytes, under its field. It is not live: going
 * over the limit is announced once, through the field's error.
 */
export const ByteCountView: FunctionalComponent<{
  readonly used: number;
  readonly template: string;
}> = ({ used, template }) => (
  <p class={{ note: true, "byte-count": true, over: used > MAX_PASSWORD_BYTES }} part="byte-count">
    {templateParts(template, { used: String(used), max: String(MAX_PASSWORD_BYTES) }).map((part) =>
      // Each number in its own isolate, so a right-to-left sentence does not carry it off.
      typeof part === "string" ? part : <bdi>{part.value}</bdi>,
    )}
  </p>
);
