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
import { characterAnnouncement } from "../../utils/character-count";
import { oneOf } from "../../utils/choice";
import type { ValueDetail } from "../../utils/event-details";
import { growSizerText } from "../../utils/grow-sizer";
import { validityFlags } from "../../utils/validity";
import { INPUT_SIZES, type InputSize } from "../input/input-options";

/**
 * A multi-line text input, form associated: it takes part in `FormData`, `form.reset()` and
 * validation like a native textarea, and can grow with its text and count its characters.
 *
 * @part control - The native textarea.
 * @part counter - The character count.
 */
@Component({
  tag: "idg-textarea",
  styleUrls: ["../../styles/text-control.css", "../../styles/visually-hidden.css", "textarea.css"],
  shadow: { delegatesFocus: true },
  formAssociated: true,
})
export class IdgTextarea {
  @AttachInternals() internals!: ElementInternals;
  @Element() host!: HTMLElement;

  @Prop({ reflect: true }) name?: string;

  /** The current value. Reset restores the value the element started with. */
  @Prop({ mutable: true }) value = "";

  @Prop() placeholder?: string;

  /** Visible lines. With `autogrow` it is the minimum. */
  @Prop() rows = 3;

  @Prop({ reflect: true }) required = false;
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) readonly = false;
  @Prop() minlength?: number;
  @Prop() maxlength?: number;
  @Prop() autocomplete?: string;
  @Prop() spellcheck?: string;
  @Prop() autocapitalize?: string;
  @Prop({ reflect: true }) size: InputSize = "md";

  /** Grows with its content, using `field-sizing` where it exists and a hidden twin elsewhere. */
  @Prop({ reflect: true }) autogrow = false;

  /** Shows the number of characters, against `maxlength` when there is one. */
  @Prop() counter = false;

  /** Set by idg-field: the control's accessible name. */
  @Prop() accessibleLabel?: string;

  /** Set by idg-field: the hint and error text, as the control's accessible description. */
  @Prop() accessibleDescription?: string;

  /** Set by idg-field, or by you: marks the value as wrong. */
  @Prop({ reflect: true }) invalid = false;

  /** Fires on every edit. */
  @Event() idgInput!: EventEmitter<ValueDetail>;

  /** Fires when the user commits a value, such as on blur. */
  @Event() idgChange!: EventEmitter<ValueDetail>;

  @State() private formDisabled = false;

  private initialValue = "";
  private native?: HTMLTextAreaElement;

  componentWillLoad(): void {
    this.initialValue = this.value;
  }

  componentDidRender(): void {
    this.syncForm();
  }

  /** Focuses the native textarea. */
  @Method()
  setFocus(): Promise<void> {
    this.native?.focus();
    return Promise.resolve();
  }

  /** Whether the value satisfies its constraints. */
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

  private syncForm(): void {
    this.internals.setFormValue(this.value);
    const native = this.native;
    if (!native) return;
    this.internals.setValidity(validityFlags(native.validity), native.validationMessage, native);
  }

  private handleInput = (event: globalThis.Event): void => {
    this.value = (event.target as HTMLTextAreaElement).value;
    this.syncForm();
    this.idgInput.emit({ value: this.value });
  };

  private handleChange = (event: globalThis.Event): void => {
    this.value = (event.target as HTMLTextAreaElement).value;
    this.syncForm();
    this.idgChange.emit({ value: this.value });
  };

  render() {
    const size = oneOf(INPUT_SIZES, this.size, "md");
    const description = this.accessibleDescription;
    const disabled = this.disabled || this.formDisabled;
    const length = this.value.length;
    const announcement = this.counter ? characterAnnouncement(length, this.maxlength) : "";

    return (
      <div>
        <div
          class={{
            box: true,
            [`size-${size}`]: true,
            invalid: this.invalid,
            readonly: this.readonly,
            disabled,
          }}
        >
          <div class={{ grow: true, autogrow: this.autogrow }}>
            {this.autogrow ? (
              <div class="sizer native" aria-hidden="true">
                {growSizerText(this.value, this.rows)}
              </div>
            ) : null}
            <textarea
              class="native"
              part="control"
              ref={(element) => (this.native = element)}
              name={this.name}
              rows={this.rows}
              value={this.value}
              placeholder={this.placeholder}
              required={this.required}
              disabled={disabled}
              readOnly={this.readonly}
              minLength={this.minlength}
              maxLength={this.maxlength}
              autocomplete={this.autocomplete}
              spellcheck={this.spellcheck}
              autocapitalize={this.autocapitalize}
              aria-label={this.accessibleLabel}
              aria-describedby={description ? "description" : undefined}
              aria-invalid={this.invalid ? "true" : undefined}
              onInput={this.handleInput}
              onChange={this.handleChange}
            />
          </div>
          {this.invalid ? (
            <idg-icon class="invalid-mark" name="warning" aria-hidden="true" />
          ) : null}
        </div>
        {this.counter ? (
          <div class="footer">
            <span
              class={{
                counter: true,
                over: this.maxlength !== undefined && length > this.maxlength,
              }}
              part="counter"
              aria-hidden="true"
            >
              {this.maxlength === undefined
                ? String(length)
                : `${String(length)} / ${String(this.maxlength)}`}
            </span>
          </div>
        ) : null}
        <span class="visually-hidden" role="status">
          {announcement}
        </span>
        {description ? (
          <span id="description" class="visually-hidden">
            {description}
          </span>
        ) : null}
      </div>
    );
  }
}
