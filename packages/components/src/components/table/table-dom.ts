function childrenNamed(parent: Element, name: string): HTMLElement[] {
  return Array.from(parent.children).filter(
    (child): child is HTMLElement => child.localName === name,
  );
}

/** The `<table>` a table component wraps: its first child table. */
export function slottedTable(host: Element): HTMLElement | undefined {
  return childrenNamed(host, "table")[0];
}

/** The `<caption>` that names the table, if it has one. */
export function captionOf(table: Element): HTMLElement | undefined {
  return childrenNamed(table, "caption")[0];
}

/** The header cells marked sortable. */
export function sortableHeaders(table: Element): HTMLElement[] {
  return Array.from(table.querySelectorAll<HTMLElement>("thead > tr > th[data-sortable]"));
}

/** The body row groups, each sorted on its own so a table with several keeps its sections. */
export function bodyGroups(table: Element): HTMLElement[] {
  return childrenNamed(table, "tbody");
}

export function rowsOf(group: Element): HTMLElement[] {
  return childrenNamed(group, "tr");
}

/** A cell's place in its row. A cell that spans columns counts as one, as it does in a header row. */
export function columnIndex(cell: Element): number {
  return cell.parentElement ? Array.from(cell.parentElement.children).indexOf(cell) : -1;
}

/** What a cell sorts by: its `data-sort-value`, else its text with the white space tidied. */
export function sortValueOf(row: Element, column: number): string {
  const cell = Array.from(row.children)[column];
  if (!cell) return "";
  const text = cell.getAttribute("data-sort-value") ?? cell.textContent;
  return text.replace(/\s+/g, " ").trim();
}

/** A header's sort key: its `data-sortable`, or its column when that is empty. */
export function sortKeyOf(header: Element): string {
  const named = header.getAttribute("data-sortable") ?? "";
  return named === "" ? String(columnIndex(header)) : named;
}

export function hasSortButton(header: Element): boolean {
  return Array.from(header.children).some((child) => child.classList.contains("idg-table-sort"));
}

/**
 * Wraps a header's content in a button, and adds the mark drawn beside it. The nodes are moved, not
 * copied or rebuilt from text, so anything the header holds keeps its identity and listeners.
 */
export function addSortButton(header: Element): void {
  const button = header.ownerDocument.createElement("button");
  button.setAttribute("type", "button");
  button.className = "idg-table-sort";
  while (header.firstChild) button.append(header.firstChild);
  const mark = header.ownerDocument.createElement("span");
  mark.className = "idg-table-sort-mark";
  mark.setAttribute("aria-hidden", "true");
  button.append(mark);
  header.append(button);
}
