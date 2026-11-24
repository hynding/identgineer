import type { CleanElement } from "./filter-svg-tree.ts";

/**
 * Makes ids for elements the sanitiser adds, none already in the tree. They are renamed with every
 * other id before the output is written, so only their uniqueness matters.
 */
export function freshIds(root: CleanElement): () => string {
  const taken = new Set<string>();
  const stack = [root];
  for (let element = stack.pop(); element !== undefined; element = stack.pop()) {
    const id = element.attributes.get("id");
    if (id !== undefined && "text" in id) taken.add(id.text);
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
