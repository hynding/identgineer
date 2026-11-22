/** Queries into an identity component's shadow root, for the unit tests. */

export interface InputElement extends HTMLElement {
  value: string;
  setFocus: () => Promise<void>;
}

export interface FieldElement extends HTMLElement {
  label?: string;
  error?: string;
  hint?: string;
}

export function shadowOf(root: HTMLElement): ShadowRoot {
  if (!root.shadowRoot) throw new Error(`${root.localName} rendered no shadow root`);
  return root.shadowRoot;
}

export function form(root: HTMLElement, selector = "form"): HTMLFormElement {
  const element = shadowOf(root).querySelector<HTMLFormElement>(selector);
  if (!element) throw new Error(`no ${selector} in ${root.localName}`);
  return element;
}

/** The control named `name`, an idg-input, idg-textarea, idg-select or idg-switch. */
export function control(root: HTMLElement, name: string): InputElement {
  const element = shadowOf(root).querySelector<InputElement>(`[name="${name}"]`);
  if (!element) throw new Error(`no control named ${name} in ${root.localName}`);
  return element;
}

/** The native input inside the idg-input named `name`, where autofill looks. */
export function nativeInput(root: HTMLElement, name: string): HTMLInputElement {
  const input = control(root, name).shadowRoot?.querySelector<HTMLInputElement>("input");
  if (!input) throw new Error(`the control ${name} rendered no native input`);
  return input;
}

/** The idg-field around the control named `name`. */
export function fieldOf(root: HTMLElement, name: string): FieldElement {
  const field = control(root, name).closest("idg-field");
  if (!field) throw new Error(`the control ${name} is not in a field`);
  return field as FieldElement;
}

export function fill(root: HTMLElement, values: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(values)) control(root, name).value = value;
}

/** Submits as the browser does once the submit button or Enter asks the form to. */
export function submit(root: HTMLElement, selector = "form"): Event {
  const event = new Event("submit", { bubbles: true, cancelable: true });
  form(root, selector).dispatchEvent(event);
  return event;
}

/** The text of the element matching `selector`, spaces collapsed; "" when there is none. */
export function textOf(root: HTMLElement, selector: string): string {
  const element = shadowOf(root).querySelector(selector);
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function button(root: HTMLElement, selector: string): HTMLElement & { loading: boolean } {
  const element = shadowOf(root).querySelector<HTMLElement & { loading: boolean }>(selector);
  if (!element) throw new Error(`no ${selector} in ${root.localName}`);
  return element;
}

/** Every event of the given names that reaches the document, with its detail. */
export function recordEvents(names: readonly string[]) {
  const seen: { type: string; detail: unknown }[] = [];
  const listener = (event: Event) => {
    seen.push({ type: event.type, detail: (event as CustomEvent).detail });
  };
  for (const name of names) document.addEventListener(name, listener);
  return {
    seen,
    stop: () => {
      for (const name of names) document.removeEventListener(name, listener);
    },
  };
}
