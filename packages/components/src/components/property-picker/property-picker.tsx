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
import { parseTrackedProperties } from "../../dashboard/parse-dashboard-data";
import type { TrackedProperty } from "../../dashboard/dashboard-types";
import { mergeLabels } from "../../identity/labels";
import type { ValueDetail } from "../../utils/event-details";
import { displayText } from "../../utils/untrusted-text";
import { PROPERTY_PICKER_LABELS, type PropertyPickerLabels } from "./property-picker-labels";

const MAX_NAME_LENGTH = 80;
const MAX_HOST_LENGTH = 60;

function optionText(property: TrackedProperty): string {
  const name = displayText(property.name, MAX_NAME_LENGTH);
  if (property.origin === undefined) return name;
  // The origin was checked to be an address, and only its host is shown, which tells two
  // properties of one name apart.
  return `${name} · ${displayText(new URL(property.origin).host, MAX_HOST_LENGTH)}`;
}

/**
 * Lets a signed-in user choose which tracked property (site) the dashboard shows. It is a labelled
 * `idg-select` that lists the `properties` it is given and reports the chosen id with `idgChange`.
 * It is form associated: with a `name` it submits the chosen id.
 *
 * Property names are text the user typed: they are shown as text only, with control and
 * bidirectional characters replaced and long names cut. A `value` that is not one of the
 * properties selects nothing (the disabled prompt shows) and is left as it is, so it is chosen when the
 * property appears in the list later, and is never replaced by the first property.
 *
 * @part field - The labelled field.
 * @part select - The select.
 * @part status - The out-of-sight live region that says the properties are loading.
 */
@Component({
  tag: "idg-property-picker",
  styleUrls: ["../../styles/visually-hidden.css", "property-picker.css"],
  shadow: { delegatesFocus: true },
  formAssociated: true,
})
export class IdgPropertyPicker {
  @AttachInternals() internals!: ElementInternals;
  @Element() host!: HTMLElement;

  @Prop({ reflect: true }) name?: string;

  /**
   * The properties to choose from: `{ id, name, origin? }`. Records that are malformed or repeat
   * an id are left out.
   */
  @Prop() properties?: TrackedProperty[];

  /** The id of the chosen property. Reset restores the value the element started with. */
  @Prop({ mutable: true }) value = "";

  /** The visible label and the accessible name. */
  @Prop() label?: string;

  /** The words of the picker, merged over the English defaults. */
  @Prop() labels?: Partial<PropertyPickerLabels>;

  /** While the properties load: disabled, busy, and said politely. */
  @Prop({ reflect: true }) loading = false;

  @Prop({ reflect: true }) disabled = false;

  /**
   * Fires when the user chooses a property, with its id as `{ value }`, and not when `value` is set
   * from script.
   */
  @Event() idgChange!: EventEmitter<ValueDetail>;

  @State() private formDisabled = false;

  private initialValue = "";
  private select?: HTMLIdgSelectElement;
  private parsedFrom?: unknown;
  private parsed: TrackedProperty[] = [];

  componentWillLoad(): void {
    this.initialValue = this.value;
  }

  componentDidRender(): void {
    const selected = this.selectedId();
    this.internals.setFormValue(selected === "" ? null : selected);
    this.holdValue(this.loading ? "" : selected);
  }

  // The select copies its options from the ones drawn here a moment after they change, and a value
  // it is given before the copy is finished is one it takes for unknown and replaces with the first
  // option. So once that moment has passed, the value is given again if the select lost it.
  private holdValue(wanted: string): void {
    void Promise.resolve().then(() => {
      if (this.select && this.select.value !== wanted) this.select.value = wanted;
    });
  }

  /** Focuses the select. */
  @Method()
  async setFocus(): Promise<void> {
    await this.select?.setFocus();
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

  // Checked again only when the page gives another list, so a re-render does not walk it again.
  private list(): TrackedProperty[] {
    if (this.parsedFrom !== this.properties) {
      this.parsedFrom = this.properties;
      this.parsed = parseTrackedProperties(this.properties);
    }
    return this.parsed;
  }

  private selectedId(): string {
    return this.list().some((property) => property.id === this.value) ? this.value : "";
  }

  private handleChange = (event: CustomEvent<ValueDetail>): void => {
    // The select's own event stays inside: what the page hears is this element's, after the id
    // has been checked against the list it gave.
    event.stopPropagation();
    const id: unknown = event.detail.value;
    if (typeof id !== "string" || id === this.selectedId()) return;
    if (!this.list().some((property) => property.id === id)) return;
    this.value = id;
    this.idgChange.emit({ value: id });
  };

  private handleInput = (event: CustomEvent<ValueDetail>): void => {
    event.stopPropagation();
  };

  // The prompt is always the first option, and disabled so it cannot be chosen again. The set of
  // options then never changes with the value, so the select is never asked for a value whose
  // option is not there yet, which it would answer by choosing the first property.
  private renderOptions(labels: PropertyPickerLabels) {
    const properties = this.list();
    if (this.loading) return <option value="">{labels.loading}</option>;
    if (properties.length === 0) return <option value="">{labels.empty}</option>;
    return [
      <option key="" value="" disabled>
        {labels.placeholder}
      </option>,
      ...properties.map((property) => (
        <option key={property.id} value={property.id}>
          {optionText(property)}
        </option>
      )),
    ];
  }

  render() {
    const labels = mergeLabels(PROPERTY_PICKER_LABELS, this.labels);
    const selected = this.loading ? "" : this.selectedId();
    const unavailable = this.loading || this.list().length === 0;
    return (
      <div class="picker" aria-busy={this.loading ? "true" : undefined}>
        <idg-field
          part="field"
          label={this.label === undefined || this.label === "" ? labels.label : this.label}
        >
          <idg-select
            part="select"
            ref={(element) => (this.select = element)}
            value={selected}
            disabled={this.disabled || this.formDisabled || unavailable}
            onIdgChange={this.handleChange}
            onIdgInput={this.handleInput}
          >
            {this.renderOptions(labels)}
          </idg-select>
        </idg-field>
        <span class="visually-hidden" part="status" role="status">
          {this.loading ? labels.loading : ""}
        </span>
      </div>
    );
  }
}
