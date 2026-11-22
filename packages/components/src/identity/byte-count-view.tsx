import { h, type FunctionalComponent } from "@stencil/core";
import { fillTemplate } from "./labels";
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
    {fillTemplate(template, { used: String(used), max: String(MAX_PASSWORD_BYTES) })}
  </p>
);
