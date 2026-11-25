/**
 * The value of an own property of untrusted data, or `undefined` when there is none: nothing is
 * read through the prototype, and a getter or a proxy that throws reads as nothing. Data that a
 * page gives a component as a property may be anything, and a component never lets what it holds
 * decide whether it renders.
 */
export function ownValue(source: unknown, key: string): unknown {
  try {
    if (typeof source !== "object" || source === null || !Object.hasOwn(source, key)) {
      return undefined;
    }
    return (source as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}
