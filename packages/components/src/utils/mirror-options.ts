const COPIED_FLAGS = ["disabled", "selected"] as const;

function copyOption(source: Element, document: Document): HTMLOptionElement {
  const option = document.createElement("option");
  const value = source.getAttribute("value");
  if (value !== null) option.setAttribute("value", value);
  const label = source.getAttribute("label");
  if (label !== null) option.setAttribute("label", label);
  for (const flag of COPIED_FLAGS) {
    if (source.hasAttribute(flag)) option.setAttribute(flag, "");
  }
  option.textContent = source.textContent;
  return option;
}

function copyGroup(source: Element, document: Document): HTMLOptGroupElement {
  const group = document.createElement("optgroup");
  group.setAttribute("label", source.getAttribute("label") ?? "");
  if (source.hasAttribute("disabled")) group.setAttribute("disabled", "");
  for (const child of Array.from(source.children)) {
    if (child.localName === "option") group.appendChild(copyOption(child, document));
  }
  return group;
}

/**
 * Rebuilds a native select's options from light-DOM option and optgroup elements. Each copy is
 * created with DOM calls and given text, never markup, so slotted content cannot inject anything
 * into the shadow root; anything that is not an option or group is ignored.
 */
export function mirrorOptions(sources: readonly Element[], target: HTMLSelectElement): void {
  const document = target.ownerDocument;
  while (target.firstChild) target.removeChild(target.firstChild);
  for (const source of sources) {
    if (source.localName === "option") target.appendChild(copyOption(source, document));
    else if (source.localName === "optgroup") target.appendChild(copyGroup(source, document));
  }
}

function trimmedText(node: { textContent: string | null }): string {
  return (node.textContent ?? "").trim();
}

/** The value an option submits: its value attribute, or else its text, as in a native select. */
export function optionValue(option: Element): string {
  return option.getAttribute("value") ?? trimmedText(option);
}

/**
 * What the copied options depend on, as text: two lists with the same signature copy to the same
 * native options, so a select can tell whether it has to rebuild them without writing anything.
 */
export function optionsSignature(sources: readonly Element[]): string {
  const describe = (source: Element): unknown[] => [
    source.localName,
    source.getAttribute("value"),
    source.getAttribute("label"),
    source.hasAttribute("disabled"),
    source.hasAttribute("selected"),
    source.localName === "optgroup"
      ? Array.from(source.children).map(describe)
      : source.textContent,
  ];
  return JSON.stringify(
    sources
      .filter((source) => source.localName === "option" || source.localName === "optgroup")
      .map(describe),
  );
}
