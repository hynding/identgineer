/**
 * The labels a component uses: its defaults, with every string of `overrides` in place of the
 * default of the same name. Anything else in `overrides` is ignored, so a partial object built in
 * JavaScript can translate some labels without blanking the rest.
 */
export function mergeLabels<T extends object>(defaults: T, overrides: Partial<T> | undefined): T {
  // Typed loosely on purpose: the prop is set from JavaScript, which checks nothing.
  const source: unknown = overrides;
  if (typeof source !== "object" || source === null) return defaults;
  const merged = { ...defaults } as Record<string, unknown>;
  for (const key of Object.keys(defaults)) {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === "string") merged[key] = value;
  }
  return merged as T;
}

/** Puts each value in place of its `{name}` placeholder; an unknown placeholder stays. */
export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name] ?? placeholder);
}

/** A placeholder's value in a template split by `templateParts`. */
export interface TemplateValue {
  readonly value: string;
}

/**
 * The template as text and filled placeholders, in the template's own order, for a view that
 * wraps each value (in `<bdi>`, say) while the translation decides where it goes.
 */
export function templateParts(
  template: string,
  values: Readonly<Record<string, string>>,
): (string | TemplateValue)[] {
  const parts: (string | TemplateValue)[] = [];
  let text = "";
  let last = 0;
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    const value = values[match[1] ?? ""];
    text += template.slice(last, match.index);
    last = match.index + match[0].length;
    if (value === undefined) {
      text += match[0];
      continue;
    }
    if (text !== "") parts.push(text);
    text = "";
    parts.push({ value });
  }
  text += template.slice(last);
  if (text !== "") parts.push(text);
  return parts;
}
