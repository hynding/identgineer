import type { CleanElement } from "./filter-svg-tree.ts";

/**
 * Makes ids for elements the sanitiser adds: none that anything in the tree defines or refers to,
 * so nothing written as a reference can come to name what the sanitiser adds. They are renamed with
 * every other id before the output is written, so only their uniqueness matters.
 */
export function freshIds(root: CleanElement): () => string {
  const taken = new Set<string>();
  const stack = [root];
  for (let element = stack.pop(); element !== undefined; element = stack.pop()) {
    for (const [name, value] of element.attributes) {
      if (name === "id" && "text" in value) taken.add(value.text);
      if ("reference" in value) taken.add(value.reference);
    }
    stack.push(...element.children);
  }
  let next = 0;
  return () => {
    let id = `_${String(next)}`;
    while (taken.has(id)) {
      next += 1;
      id = `_${String(next)}`;
    }
    taken.add(id);
    next += 1;
    return id;
  };
}
