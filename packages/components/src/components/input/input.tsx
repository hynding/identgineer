import {
  AttachInternals,
  Component,
  Element,
  Event,
  h,
  Method,
  Prop,
  State,
  type EventEmitter,
} from "@stencil/core";
import { oneOf } from "../../utils/choice";
import type { ValueDetail } from "../../utils/event-details";
import { validityFlags } from "../../utils/validity";
import { INPUT_SIZES, INPUT_TYPES, type InputSize, type InputType } from "./input-options";

/**
 * @slot start - Content inside the box before the text, such as an icon.
 * @slot end - Content inside the box after the text.
 * @part control - The native input.
 */
@Component({
  tag: "idg-input",
  styleUrls: ["../../styles/text-control.css", "../../styles/visually-hidden.css", "input.css"],
  shadow: { delegatesFocus: true },
  formAssociated: true,
})
export class IdgInput {
  @AttachInternals() internals!: ElementInternals;
  @Element() host!: HTMLElement;

  /** What kind of text the control takes. Unknown values fall back to `text`. */
  @Prop({ reflect: true }) type: InputType = "text";

  /** The name the value is submitted under. */
  @Prop({ reflect: true }) name?: string;

  /** The current value. Reset restores the value the element started with. */
  @Prop({ mutable: true }) value = "";

  @Prop() placeholder?: string;
  @Prop({ reflect: true }) required = false;
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) readonly = false;
  @Prop() minlength?: number;
  @Prop() maxlength?: number;
  @Prop() min?: string;
  @Prop() max?: string;
  @Prop() step?: string;
  @Prop() pattern?: string;
  @Prop() autocomplete?: string;
  @Prop() inputmode?: string;
  @Prop() enterkeyhint?: string;
  @Prop() spellcheck?: string;
  @Prop() autocapitalize?: string;

  /** Control size. Never smaller than the design's minimum target size. */
  @Prop({ reflect: true }) size: InputSize = "md";

  /** Adds a button that shows a password as text. Only for `type="password"`. */
  @Prop() reveal = false;

  /** The name of the reveal button. */
  @Prop() revealLabel = "Show password";

  /** Set by idg-field: the control's accessible name. */
  @Prop() accessibleLabel?: string;

  /** Set by idg-field: the hint and error text, as the control's accessible description. */
  @Prop() accessibleDescription?: string;

  /** Set by idg-field, or by you: marks the value as wrong. */
  @Prop({ reflect: true }) invalid = false;

  /** Fires on every edit. */
  @Event() idgInput!: EventEmitter<ValueDetail>;

  /** Fires when the user commits a value, such as on blur or Enter. */
  @Event() idgChange!: EventEmitter<ValueDetail>;

  @State() private revealed = false;
  @State() private formDisabled = false;

  private initialValue = "";
  private native?: HTMLInputElement;

  componentWillLoad(): void {
    this.initialValue = this.value;
  }

  componentDidRender(): void {
    this.syncForm();
  }

  /** Focuses the native input. */
  @Method()
  setFocus(): Promise<void> {
    this.native?.focus();
    return Promise.resolve();
  }

  /** Selects the text of the native input, for a value that is meant to be copied. */
  @Method()
  selectText(): Promise<void> {
    this.native?.select();
    return Promise.resolve();
  }

  /** Whether the value satisfies its constraints. Fires no UI. */
  @Method()
  checkValidity(): Promise<boolean> {
    return Promise.resolve(this.internals.checkValidity());
  }

  /** Whether the value is valid, showing the browser's message when it is not. */
  @Method()
  reportValidity(): Promise<boolean> {
    return Promise.resolve(this.internals.reportValidity());
  }

  formResetCallback(): void {
    this.value = this.initialValue;
  }

  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled;
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
    if (typeof state === "string") this.value = state;
  }

  // Also called from the event handlers, not only after a render, so a form submitted in the same
  // frame as the keystroke already has the new value.
  // The native input sits in a shadow root, so it takes no part in the form itself: the host
  // submits the value and carries the validity, which is read back from the native input so the
  // rules and the messages are the browser's own.
  private syncForm(): void {
    this.internals.setFormValue(this.value);
    const native = this.native;
    if (!native) return;
    this.internals.setValidity(validityFlags(native.validity), native.validationMessage, native);
  }

  private handleInput = (event: globalThis.Event): void => {
    this.value = (event.target as HTMLInputElement).value;
    this.syncForm();
    this.idgInput.emit({ value: this.value });
  };

  private handleChange = (event: globalThis.Event): void => {
    this.value = (event.target as HTMLInputElement).value;
    this.syncForm();
    this.idgChange.emit({ value: this.value });
  };

  // The native input has no form owner across the shadow boundary, so the browser's implicit
  // submission never happens: Enter submits the host's form here instead, as it would natively.
  private handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" || event.isComposing || event.defaultPrevented) return;
    const form = this.internals.form;
    if (!form) return;
    event.preventDefault();
    form.requestSubmit();
  };

  private toggleReveal = (): void => {
    this.revealed = !this.revealed;
  };

  render() {
    const type = oneOf(INPUT_TYPES, this.type, "text");
    const size = oneOf(INPUT_SIZES, this.size, "md");
    const showReveal = this.reveal && type === "password";
    const description = this.accessibleDescription;
    const disabled = this.disabled || this.formDisabled;

    return (
      <div
        class={{
          box: true,
          [`size-${size}`]: true,
          invalid: this.invalid,
          readonly: this.readonly,
          disabled,
        }}
      >
        <slot name="start" />
        <input
          class="native"
          part="control"
          ref={(element) => (this.native = element)}
          type={showReveal && this.revealed ? "text" : type}
          name={this.name}
          value={this.value}
          placeholder={this.placeholder}
          required={this.required}
          disabled={disabled}
          readOnly={this.readonly}
          minLength={this.minlength}
          maxLength={this.maxlength}
          min={this.min}
          max={this.max}
          step={this.step}
          pattern={this.pattern}
          autocomplete={this.autocomplete}
          inputMode={this.inputmode}
          enterKeyHint={this.enterkeyhint}
          spellcheck={this.spellcheck}
          autocapitalize={this.autocapitalize}
          aria-label={this.accessibleLabel}
          aria-describedby={description ? "description" : undefined}
          aria-invalid={this.invalid ? "true" : undefined}
          onInput={this.handleInput}
          onChange={this.handleChange}
          onKeydown={this.handleKeydown}
        />
        {this.invalid ? <idg-icon class="invalid-mark" name="warning" aria-hidden="true" /> : null}
        {showReveal ? (
          <button
            class="reveal"
            type="button"
            aria-pressed={this.revealed ? "true" : "false"}
            aria-label={this.revealLabel}
            disabled={disabled}
            onClick={this.toggleReveal}
          >
            <idg-icon name={this.revealed ? "eye-off" : "eye"} />
          </button>
        ) : null}
        <slot name="end" />
        {description ? (
          <span id="description" class="visually-hidden">
            {description}
          </span>
        ) : null}
      </div>
    );
  }
}
