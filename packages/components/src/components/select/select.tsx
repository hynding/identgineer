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
import { mirrorOptions, optionValue } from "../../utils/mirror-options";
import { validityFlags } from "../../utils/validity";
import { INPUT_SIZES, type InputSize } from "../input/input-options";

/**
 * Options are written as children, exactly as for a native select, and copied into the native
 * select inside the component: the same markup works with or without a framework, and no option
 * data has to be serialised into an attribute.
 *
 * @slot - `option` and `optgroup` elements.
 * @part control - The native select.
 */
@Component({
  tag: "idg-select",
  styleUrls: ["../../styles/text-control.css", "../../styles/visually-hidden.css", "select.css"],
  shadow: { delegatesFocus: true },
  formAssociated: true,
})
export class IdgSelect {
  @AttachInternals() internals!: ElementInternals;
  @Element() host!: HTMLElement;

  @Prop({ reflect: true }) name?: string;

  /** The value of the chosen option. Reset restores the value the element started with. */
  @Prop({ mutable: true }) value = "";

  @Prop({ reflect: true }) required = false;
  @Prop({ reflect: true }) disabled = false;
  @Prop({ reflect: true }) size: InputSize = "md";

  /** Set by idg-field: the control's accessible name. */
  @Prop() accessibleLabel?: string;

  /** Set by idg-field: the hint and error text, as the control's accessible description. */
  @Prop() accessibleDescription?: string;

  /** Set by idg-field, or by you: marks the value as wrong. */
  @Prop({ reflect: true }) invalid = false;

  /** Fires as the choice changes. */
  @Event() idgInput!: EventEmitter<ValueDetail>;

  /** Fires when the user commits a choice. */
  @Event() idgChange!: EventEmitter<ValueDetail>;

  @State() private formDisabled = false;

  private initialValue = "";
  private native?: HTMLSelectElement;
  private observer?: MutationObserver;

  connectedCallback(): void {
    if (typeof MutationObserver === "undefined") return;
    // Slotchange reports added and removed options; this also catches an option's text, value or
    // state changing in place.
    this.observer = new MutationObserver(() => {
      this.mirror();
    });
    this.observer.observe(this.host, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["value", "label", "disabled", "selected"],
    });
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
  }

  componentDidLoad(): void {
    this.mirror();
    this.initialValue = this.value;
  }

  componentDidRender(): void {
    this.syncForm();
  }

  /** Focuses the native select. */
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
    this.value = this.initialValue;
  }

  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled;
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
    if (typeof state === "string") this.value = state;
  }

  private mirror(): void {
    const native = this.native;
    if (!native) return;
    mirrorOptions(Array.from(this.host.children), native);
    this.selectCurrentValue(native);
  }

  // An option the author marked selected, or the first one, is the value when none is given. A
  // value that matches no option (yet: a list that arrives later has none to match) is left as it
  // is and is not forced onto the select, which would blank it; the mirror applies it again when
  // its option arrives.
  private selectCurrentValue(native: HTMLSelectElement): void {
    const matches = Array.from(native.querySelectorAll("option")).some(
      (option) => optionValue(option) === this.value,
    );
    if (matches) native.value = this.value;
    else if (this.value === "" && native.value !== this.value) this.value = native.value;
  }

  private syncForm(): void {
    this.internals.setFormValue(this.value);
    const native = this.native;
    if (!native) return;
    this.internals.setValidity(validityFlags(native.validity), native.validationMessage, native);
  }

  private handleInput = (event: globalThis.Event): void => {
    this.value = (event.target as HTMLSelectElement).value;
    this.syncForm();
    this.idgInput.emit({ value: this.value });
  };

  private handleChange = (event: globalThis.Event): void => {
    this.value = (event.target as HTMLSelectElement).value;
    this.syncForm();
    this.idgChange.emit({ value: this.value });
  };

  componentDidUpdate(): void {
    if (this.native) this.selectCurrentValue(this.native);
  }

  render() {
    const size = oneOf(INPUT_SIZES, this.size, "md");
    const description = this.accessibleDescription;
    const disabled = this.disabled || this.formDisabled;

    return (
      <div class={{ box: true, [`size-${size}`]: true, invalid: this.invalid, disabled }}>
        <select
          class="native"
          part="control"
          ref={(element) => (this.native = element)}
          name={this.name}
          required={this.required}
          disabled={disabled}
          aria-label={this.accessibleLabel}
          aria-describedby={description ? "description" : undefined}
          aria-invalid={this.invalid ? "true" : undefined}
          onInput={this.handleInput}
          onChange={this.handleChange}
        />
        {this.invalid ? <idg-icon class="invalid-mark" name="warning" aria-hidden="true" /> : null}
        <idg-icon class="chevron" name="chevron-down" aria-hidden="true" />
        <div hidden>
          <slot
            onSlotchange={() => {
              this.mirror();
            }}
          />
        </div>
        {description ? (
          <span id="description" class="visually-hidden">
            {description}
          </span>
        ) : null}
      </div>
    );
  }
}
