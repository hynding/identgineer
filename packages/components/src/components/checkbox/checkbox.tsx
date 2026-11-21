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
import type { CheckedDetail } from "../../utils/event-details";
import { validityFlags } from "../../utils/validity";

/**
 * @slot - The label. It also names the checkbox.
 * @part control - The native checkbox.
 * @part label - The text beside the box.
 */
@Component({
  tag: "idg-checkbox",
  styleUrls: [
    "../../styles/choice-control.css",
    "../../styles/visually-hidden.css",
    "checkbox.css",
  ],
  shadow: { delegatesFocus: true },
  formAssociated: true,
})
export class IdgCheckbox {
  @AttachInternals() internals!: ElementInternals;
  @Element() host!: HTMLElement;

  @Prop({ reflect: true }) name?: string;

  /** What is submitted while checked. */
  @Prop() value = "on";

  @Prop({ mutable: true, reflect: true }) checked = false;

  /** Shows a mixed state, such as a parent of partly selected children. A user choice clears it. */
  @Prop({ mutable: true, reflect: true }) indeterminate = false;

  @Prop({ reflect: true }) required = false;
  @Prop({ reflect: true }) disabled = false;

  /** Set by idg-field, or by you: replaces the slotted text as the accessible name. */
  @Prop() accessibleLabel?: string;

  /** Set by idg-field: the hint and error text, as the control's accessible description. */
  @Prop() accessibleDescription?: string;

  /** Marks the choice as wrong. */
  @Prop({ reflect: true }) invalid = false;

  /** Fires when the user toggles the checkbox. */
  @Event() idgChange!: EventEmitter<CheckedDetail>;

  @State() private formDisabled = false;

  private initialChecked = false;
  private initialIndeterminate = false;
  private native?: HTMLInputElement;

  componentWillLoad(): void {
    this.initialChecked = this.checked;
    this.initialIndeterminate = this.indeterminate;
  }

  componentDidRender(): void {
    // Indeterminate is a property of the native input with no attribute.
    if (this.native) this.native.indeterminate = this.indeterminate;
    this.syncForm();
  }

  /** Focuses the native checkbox. */
  @Method()
  setFocus(): Promise<void> {
    this.native?.focus();
    return Promise.resolve();
  }

  /** Whether the choice satisfies its constraints. */
  @Method()
  checkValidity(): Promise<boolean> {
    return Promise.resolve(this.internals.checkValidity());
  }

  /** Whether the choice is valid, showing the browser's message when it is not. */
  @Method()
  reportValidity(): Promise<boolean> {
    return Promise.resolve(this.internals.reportValidity());
  }

  formResetCallback(): void {
    this.checked = this.initialChecked;
    this.indeterminate = this.initialIndeterminate;
  }

  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled;
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
    this.checked = typeof state === "string";
  }

  private syncForm(): void {
    this.internals.setFormValue(this.checked ? this.value : null);
    const native = this.native;
    if (!native) return;
    this.internals.setValidity(validityFlags(native.validity), native.validationMessage, native);
  }

  private handleChange = (event: globalThis.Event): void => {
    this.checked = (event.target as HTMLInputElement).checked;
    this.indeterminate = false;
    this.syncForm();
    this.idgChange.emit({ checked: this.checked, value: this.value });
  };

  render() {
    const description = this.accessibleDescription;
    const disabled = this.disabled || this.formDisabled;

    return (
      <label class={{ choice: true, invalid: this.invalid, disabled }}>
        <input
          class="native"
          part="control"
          type="checkbox"
          ref={(element) => (this.native = element)}
          name={this.name}
          checked={this.checked}
          required={this.required}
          disabled={disabled}
          aria-label={this.accessibleLabel}
          aria-describedby={description ? "description" : undefined}
          aria-invalid={this.invalid ? "true" : undefined}
          onChange={this.handleChange}
        />
        <span class="text" part="label">
          <slot />
        </span>
        {this.invalid ? <idg-icon class="invalid-mark" name="warning" aria-hidden="true" /> : null}
        {description ? (
          <span id="description" class="visually-hidden">
            {description}
          </span>
        ) : null}
      </label>
    );
  }
}
