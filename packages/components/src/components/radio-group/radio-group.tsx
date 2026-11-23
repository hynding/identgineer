import {
  AttachInternals,
  Component,
  Element,
  Event,
  h,
  Listen,
  Method,
  Prop,
  State,
  type EventEmitter,
} from "@stencil/core";
import type { ValueDetail } from "../../utils/event-details";
import { nextRovingIndex } from "../../utils/roving";
import type { RadioSelectDetail } from "../radio/radio";

type Orientation = "vertical" | "horizontal";

const REQUIRED_MESSAGE = "Please select one of these options.";

/**
 * Follows the WAI-ARIA radio group pattern: one tab stop (the checked radio, or the first),
 * arrow keys move focus and choose, wrapping around and skipping disabled radios. The group, not
 * its radios, is the form control.
 *
 * @slot - `idg-radio` elements.
 * @part group - The box that arranges the radios, for a page that lays them out itself.
 */
@Component({
  tag: "idg-radio-group",
  styleUrls: ["../../styles/visually-hidden.css", "radio-group.css"],
  shadow: true,
  formAssociated: true,
})
export class IdgRadioGroup {
  @AttachInternals() internals!: ElementInternals;
  @Element() host!: HTMLElement;

  @Prop({ reflect: true }) name?: string;

  /** The value of the chosen radio. Reset restores the value the element started with. */
  @Prop({ mutable: true }) value = "";

  @Prop({ reflect: true }) required = false;
  @Prop({ reflect: true }) disabled = false;

  /** How the radios are laid out. */
  @Prop({ reflect: true }) orientation: Orientation = "vertical";

  /** Set by idg-field, or by you: the group's accessible name. */
  @Prop() accessibleLabel?: string;

  /** Set by idg-field: the hint and error text, as the group's accessible description. */
  @Prop() accessibleDescription?: string;

  /** Set by idg-field, or by you: marks the choice as wrong. */
  @Prop({ reflect: true }) invalid = false;

  /** Fires when the user chooses a radio. */
  @Event() idgChange!: EventEmitter<ValueDetail>;

  @State() private formDisabled = false;

  private initialValue = "";

  componentWillLoad(): void {
    this.initialValue = this.value;
  }

  componentDidRender(): void {
    this.syncRadios();
    this.syncForm();
  }

  /** Focuses the radio that is the group's tab stop. */
  @Method()
  setFocus(): Promise<void> {
    const stop = this.radios().find((radio) => radio.tabbable) ?? this.radios()[0];
    return stop?.setFocus() ?? Promise.resolve();
  }

  /** Whether a choice has been made when one is required. */
  @Method()
  checkValidity(): Promise<boolean> {
    return Promise.resolve(this.internals.checkValidity());
  }

  /** Whether a choice has been made, showing the browser's message when it has not. */
  @Method()
  reportValidity(): Promise<boolean> {
    return Promise.resolve(this.internals.reportValidity());
  }

  @Listen("idgSelect")
  handleSelect(event: CustomEvent<RadioSelectDetail>): void {
    // The radio's event is an implementation detail; the group's idgChange is the public one.
    event.stopPropagation();
    this.choose(event.detail.value);
  }

  @Listen("keydown")
  handleKeydown(event: KeyboardEvent): void {
    if (this.isDisabled()) return;
    const radios = this.radios();
    const current = radios.findIndex(
      (radio) => radio === (event.target as HTMLElement).closest("idg-radio"),
    );
    if (current === -1) return;
    const enabled = radios.map((radio) => !radio.disabled);
    const next = nextRovingIndex(current, event.key, enabled, this.isRightToLeft());
    const target = next === undefined ? undefined : radios[next];
    if (!target) return;
    event.preventDefault();
    this.choose(target.value);
    void target.setFocus();
  }

  formResetCallback(): void {
    this.value = this.initialValue;
  }

  formDisabledCallback(disabled: boolean): void {
    this.formDisabled = disabled;
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
    this.value = typeof state === "string" ? state : "";
  }

  private radios(): HTMLIdgRadioElement[] {
    return Array.from(this.host.querySelectorAll("idg-radio"));
  }

  private isDisabled(): boolean {
    return this.disabled || this.formDisabled;
  }

  private isRightToLeft(): boolean {
    return getComputedStyle(this.host).direction === "rtl";
  }

  private choose(value: string): void {
    if (this.isDisabled() || value === this.value) return;
    this.value = value;
    this.syncForm();
    this.idgChange.emit({ value });
  }

  // Pushes state into the radios after every render, because a radio cannot see its group.
  private syncRadios(): void {
    const radios = this.radios();
    const checked = radios.findIndex((radio) => radio.value === this.value);
    const firstEnabled = radios.findIndex((radio) => !radio.disabled);
    const stop = checked !== -1 && !radios[checked]?.disabled ? checked : firstEnabled;
    radios.forEach((radio, index) => {
      radio.checked = index === checked;
      radio.tabbable = index === stop;
      radio.position = index + 1;
      radio.setSize = radios.length;
      radio.groupDisabled = this.isDisabled();
      radio.invalid = this.invalid;
    });
  }

  private syncForm(): void {
    this.internals.setFormValue(this.value === "" ? null : this.value);
    const anchor = this.radios()[0]?.shadowRoot?.querySelector("input") ?? undefined;
    if (this.required && this.value === "") {
      this.internals.setValidity({ valueMissing: true }, REQUIRED_MESSAGE, anchor);
    } else {
      this.internals.setValidity({});
    }
  }

  render() {
    const description = this.accessibleDescription;
    return (
      <div
        class="group"
        part="group"
        role="radiogroup"
        aria-label={this.accessibleLabel}
        aria-describedby={description ? "description" : undefined}
        aria-required={this.required ? "true" : undefined}
        aria-invalid={this.invalid ? "true" : undefined}
      >
        <slot
          onSlotchange={() => {
            this.syncRadios();
          }}
        />
        {description ? (
          <span id="description" class="visually-hidden">
            {description}
          </span>
        ) : null}
      </div>
    );
  }
}
