/**
 * The labels a component uses: its defaults, with every string of `overrides` in place of the
 * default of the same name. Anything else in `overrides` is ignored, so a partial object built in
 * JavaScript can translate some labels without blanking the rest.
 */
export function mergeLabels<T extends object>(defaults: T, overrides: Partial<T> | undefined): T {
  // Typed loosely on purpose: the prop is set from JavaScript, which checks nothing.
  const source: unknown = overrides;
  if (typeof source !== "object" || source === null) return defaults;
  const merged: Record<string, unknown> = { ...defaults };
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
