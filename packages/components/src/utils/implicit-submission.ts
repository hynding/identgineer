// The HTML implicit submission algorithm, for controls whose native input sits in a shadow root:
// such an input has no form owner, so the browser never submits the form on Enter by itself.
// https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#implicit-submission

/** The input types whose Enter submits implicitly; every type of idg-input is one of them. */
const BLOCKING_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
  "number",
]);

interface TypedElement extends Element {
  readonly type?: unknown;
  readonly loading?: unknown;
}

function isSubmitButton(element: TypedElement): boolean {
  switch (element.localName) {
    case "button":
      return element.type === "submit";
    case "input":
      return element.type === "submit" || element.type === "image";
    case "idg-button":
      return element.type === "submit";
    default:
      return false;
  }
}

function blocksImplicitSubmission(element: TypedElement): boolean {
  if (element.localName === "idg-input") return true;
  return element.localName === "input" && BLOCKING_TYPES.has(String(element.type));
}

function isUnavailable(element: TypedElement): boolean {
  return element.matches(":disabled") || element.loading === true;
}

// Implicit submission clicks the default button, so the click listeners run and the button is the
// submitter. An idg-button handles activation on its inner control, which is what is clicked.
function activate(button: HTMLElement): void {
  if (button.localName !== "idg-button") {
    button.click();
    return;
  }
  button.shadowRoot?.querySelector<HTMLElement>('[part="control"]')?.click();
}

/**
 * What Enter in a single-line field does to its form: the default button (the first submit
 * button) is clicked unless it is disabled or busy; without one, the form is submitted only when
 * it has no other field that blocks implicit submission.
 */
export function submitImplicitly(form: HTMLFormElement): void {
  const elements = Array.from(form.elements) as TypedElement[];
  const button = elements.find(isSubmitButton);
  if (button) {
    if (!isUnavailable(button)) activate(button as HTMLElement);
    return;
  }
  if (elements.filter(blocksImplicitSubmission).length === 1) form.requestSubmit();
}
