/** A control of an identity form: an idg-input, idg-textarea, idg-select or idg-switch. */
// Not an HTMLElement: idg-input types `spellcheck` as the attribute's string, unlike HTMLElement.
export interface ValueControl {
  value: string;
  setFocus?: () => Promise<void>;
}

/** The trimmed value of a control, or "" when it is not drawn. Never used for a password. */
export function trimmedValue(control: ValueControl | undefined): string {
  return (control?.value ?? "").trim();
}

/** The value as typed: a password keeps its spaces. */
export function rawValue(control: ValueControl | undefined): string {
  return control?.value ?? "";
}

/** Empties password controls, so a password stays nowhere once it has been sent or left. */
export function clearControls(controls: readonly (ValueControl | undefined)[]): void {
  for (const control of controls) if (control) control.value = "";
}

interface Focusable {
  setFocus?: () => Promise<void>;
}

/** Focuses the first control, in the given order, that has an error. */
export function focusFirstInvalid(
  ordered: readonly (readonly [string, Focusable | undefined])[],
  errors: Readonly<Record<string, string>>,
): void {
  const first = ordered.find(([name]) => errors[name] !== undefined)?.[1];
  void first?.setFocus?.();
}

/**
 * The inner controls' events carry what was typed, a password included, and are composed, so
 * they would reach the page. They are an implementation detail of the form, so they stop at it;
 * the form's own events say what happened.
 */
function stopInnerEvent(event: Event): void {
  event.stopPropagation();
}

const contained = new WeakSet<HTMLElement>();

/** Stops the inner controls' `idgInput` and `idgChange` at the form, once per form element. */
export function containInnerEvents(form: HTMLElement | undefined): void {
  if (!form || contained.has(form)) return;
  contained.add(form);
  form.addEventListener("idgInput", stopInnerEvent);
  form.addEventListener("idgChange", stopInnerEvent);
}
