/** The text of idg-property-picker. Override any of it through `labels`. */
export interface PropertyPickerLabels {
  /** The visible label and the accessible name, used when the `label` prop is empty. */
  readonly label: string;
  /** The option shown while no property is chosen. */
  readonly placeholder: string;
  /** Shown, and said politely, while the properties load. */
  readonly loading: string;
  /** Shown when the user has no properties. */
  readonly empty: string;
}

export const PROPERTY_PICKER_LABELS: PropertyPickerLabels = {
  label: "Property",
  placeholder: "Choose a property",
  loading: "Loading properties",
  empty: "No properties",
};
