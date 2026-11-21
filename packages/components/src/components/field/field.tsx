import { Component, Element, h, Prop, State } from "@stencil/core";
import { applyFieldState, isFieldControl, type FieldControl } from "../../utils/field-control";
import { slottedText } from "../../utils/slot-text";

interface SlotTexts {
  label: string;
  hint: string;
  error: string;
}

/**
 * Wraps one idg-input, idg-textarea, idg-select, idg-radio-group (or any element that follows the
 * field protocol in `utils/field-control`). The label, hint and error are drawn here, but an id
 * reference cannot cross a shadow boundary, so their text is handed to the control as properties
 * and the control applies it to its own native element.
 *
 * @slot - The control.
 * @slot label - Rich label content in place of the `label` prop.
 * @slot hint - Rich hint content in place of the `hint` prop.
 * @slot error - Rich error content in place of the `error` prop.
 * @part label - The label.
 * @part hint - The hint.
 * @part error - The error.
 */
@Component({
  tag: "idg-field",
  styleUrl: "field.css",
  shadow: true,
})
export class IdgField {
  @Element() host!: HTMLElement;

  /** The visible label, and the control's accessible name. */
  @Prop() label?: string;

  /** Help text. Shown when the UX mode turns hints on, and always read with the control. */
  @Prop() hint?: string;

  /** The error message. Setting it marks the control invalid and announces the message. */
  @Prop() error?: string;

  /** Marks the control required and shows a star. */
  @Prop() required = false;

  /** Text such as "optional" shown beside the label of a field that is not required. */
  @Prop({ attribute: "optional-text" }) optionalText?: string;

  @State() private slotTexts: SlotTexts = { label: "", hint: "", error: "" };

  private observer?: MutationObserver;

  connectedCallback(): void {
    if (typeof MutationObserver === "undefined") return;
    // Slotchange only reports nodes added or removed, not text edited in place.
    this.observer = new MutationObserver(() => {
      this.readSlots();
    });
    this.observer.observe(this.host, { subtree: true, childList: true, characterData: true });
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
  }

  componentWillLoad(): void {
    this.readSlots();
  }

  componentDidRender(): void {
    this.passStateToControl();
  }

  private readSlots(): void {
    const next = {
      label: slottedText(this.host, "label"),
      hint: slottedText(this.host, "hint"),
      error: slottedText(this.host, "error"),
    };
    const { label, hint, error } = this.slotTexts;
    if (next.label !== label || next.hint !== hint || next.error !== error) this.slotTexts = next;
  }

  private text(): SlotTexts {
    return {
      label: this.slotTexts.label || (this.label ?? ""),
      hint: this.slotTexts.hint || (this.hint ?? ""),
      error: this.slotTexts.error || (this.error ?? ""),
    };
  }

  private control(): (HTMLElement & FieldControl) | undefined {
    return Array.from(this.host.children).find(
      (child): child is HTMLElement & FieldControl =>
        !child.hasAttribute("slot") && isFieldControl(child),
    );
  }

  private passStateToControl(): void {
    const control = this.control();
    if (!control) return;
    const { label, hint, error } = this.text();
    applyFieldState(control, {
      label,
      description: [hint, error].filter((part) => part !== "").join(" "),
      invalid: error !== "",
      required: this.required,
    });
  }

  private focusControl = (): void => {
    void this.control()?.setFocus?.();
  };

  render() {
    const { label, hint, error } = this.text();
    return (
      <div class="field">
        {label === "" ? null : (
          <label class="label" part="label" onClick={this.focusControl}>
            <slot name="label">{this.label}</slot>
            {this.required ? (
              <span class="marker" aria-hidden="true">
                *
              </span>
            ) : this.optionalText ? (
              <span class="optional">{this.optionalText}</span>
            ) : null}
          </label>
        )}
        <div class="control">
          <slot />
        </div>
        {hint === "" ? null : (
          <div class="hint" part="hint">
            <slot name="hint">{this.hint}</slot>
          </div>
        )}
        {/* The region exists before an error does, so inserting the message is what is announced. */}
        <div class="error" part="error" role="alert">
          {error === "" ? null : <idg-icon class="error-mark" name="error" aria-hidden="true" />}
          {error === "" ? null : (
            <span class="error-text">
              <slot name="error">{this.error}</slot>
            </span>
          )}
        </div>
      </div>
    );
  }
}
