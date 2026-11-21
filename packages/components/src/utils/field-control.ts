/**
 * What idg-field expects of the control it wraps. The label lives in the field's shadow root and
 * the control's native element in its own, and an id reference cannot cross a shadow boundary. So
 * the field hands the text down and the control applies it to its own native element.
 */
export interface FieldControl {
  accessibleLabel?: string | undefined;
  accessibleDescription?: string | undefined;
  invalid?: boolean;
  required?: boolean;
}

export interface FieldState {
  label: string;
  description: string;
  invalid: boolean;
  /** A field never un-requires a control, so the control's own `required` still applies. */
  required?: boolean;
}

export function isFieldControl(element: object): element is FieldControl {
  return "accessibleLabel" in element;
}

export function applyFieldState(control: FieldControl, state: FieldState): void {
  control.accessibleLabel = state.label === "" ? undefined : state.label;
  control.accessibleDescription = state.description === "" ? undefined : state.description;
  if ("invalid" in control || state.invalid) control.invalid = state.invalid;
  if (state.required) control.required = true;
}
