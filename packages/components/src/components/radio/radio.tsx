import { Component, Element, Event, h, Method, Prop, type EventEmitter } from "@stencil/core";

export interface RadioSelectDetail {
  value: string;
}

/**
 * Use inside idg-radio-group, which owns the value, the keyboard and the form. The props marked
 * as set by the group are how it passes state down, because radios in separate shadow roots are
 * not a native radio group.
 *
 * @slot - The label. It also names the radio.
 * @part control - The native radio.
 * @part label - The text beside the radio.
 */
@Component({
  tag: "idg-radio",
  styleUrls: ["../../styles/choice-control.css", "radio.css"],
  shadow: { delegatesFocus: true },
})
export class IdgRadio {
  @Element() host!: HTMLElement;

  /** What the group takes as its value when this radio is chosen. */
  @Prop({ reflect: true }) value = "";

  /** Set by the group from its value. */
  @Prop({ mutable: true, reflect: true }) checked = false;

  @Prop({ reflect: true }) disabled = false;

  /** Set by the group: whether the whole group is disabled. */
  @Prop() groupDisabled = false;

  /** Set by the group: whether this radio is the group's one tab stop. */
  @Prop() tabbable = true;

  /** Set by the group: this radio's place, from 1. */
  @Prop() position?: number;

  /** Set by the group: how many radios the group holds. */
  @Prop() setSize?: number;

  /** Set by the group: marks the group's value as wrong. */
  @Prop() invalid = false;

  /** Fires when the user chooses this radio. The group listens; you listen to the group. */
  @Event() idgSelect!: EventEmitter<RadioSelectDetail>;

  private native?: HTMLInputElement;

  /** Focuses the native radio. */
  @Method()
  setFocus(): Promise<void> {
    this.native?.focus();
    return Promise.resolve();
  }

  private handleChange = (): void => {
    this.checked = true;
    this.idgSelect.emit({ value: this.value });
  };

  render() {
    return (
      <label
        class={{
          choice: true,
          invalid: this.invalid,
          disabled: this.disabled || this.groupDisabled,
        }}
      >
        <input
          class="native"
          part="control"
          type="radio"
          ref={(element) => (this.native = element)}
          checked={this.checked}
          disabled={this.disabled || this.groupDisabled}
          tabindex={this.tabbable ? 0 : -1}
          aria-posinset={this.position === undefined ? undefined : String(this.position)}
          aria-setsize={this.setSize === undefined ? undefined : String(this.setSize)}
          aria-invalid={this.invalid ? "true" : undefined}
          onChange={this.handleChange}
        />
        <span class="text" part="label">
          <slot />
        </span>
      </label>
    );
  }
}
