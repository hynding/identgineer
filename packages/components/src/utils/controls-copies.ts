// Copies of the few helpers the `controls` bundle needs, which other bundles need too. Rollup puts
// a module that two bundles import in a chunk of its own, and the controls entry would then name
// five tiny chunks that are fetched only once it has arrived: a second round trip, after the one
// that fetched it, before an icon or a button a form has rendered can be drawn. A copy here is
// reached by the controls components alone, so it is in their entry. `controls-copies.test.ts`
// holds each copy to what the original does; change the original and the copy together.

export function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

function firstCharacter(word: string): string {
  return Array.from(word).find((character) => LETTER_OR_NUMBER.test(character)) ?? "";
}

export function initials(name: string | null | undefined): string {
  const letters = (name ?? "")
    .split(/\s+/)
    .map(firstCharacter)
    .filter((letter) => letter !== "");
  const [first] = letters;
  const last = letters[letters.length - 1];
  const picked = letters.length > 1 ? `${first ?? ""}${last ?? ""}` : (first ?? "");
  return picked.toLocaleUpperCase();
}

const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto", "tel"]);
const SCHEME = /^([^:/?#]*):/;

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

export function safeUrl(url: string | null | undefined): string | undefined {
  if (typeof url !== "string" || url === "") return undefined;
  if (url !== url.trim() || hasControlCharacter(url) || url.includes("\\")) return undefined;

  const scheme = SCHEME.exec(url)?.[1];
  if (scheme === undefined) return url;
  return ALLOWED_SCHEMES.has(scheme.toLowerCase()) ? url : undefined;
}

const SAME_CONTEXT_TARGET = "_self";
const HARDENING_TOKENS = ["noopener", "noreferrer"] as const;

export function linkRel(target: string | undefined, rel: string | undefined): string | undefined {
  if (target === undefined || target === "" || target.toLowerCase() === SAME_CONTEXT_TARGET) {
    return rel;
  }
  const authored = (rel ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return [...new Set([...authored, ...HARDENING_TOKENS])].join(" ");
}

export function validityFlags(
  validity: Omit<ValidityState, "valid"> & { valid?: boolean },
): ValidityStateFlags {
  return {
    badInput: validity.badInput,
    customError: validity.customError,
    patternMismatch: validity.patternMismatch,
    rangeOverflow: validity.rangeOverflow,
    rangeUnderflow: validity.rangeUnderflow,
    stepMismatch: validity.stepMismatch,
    tooLong: validity.tooLong,
    tooShort: validity.tooShort,
    typeMismatch: validity.typeMismatch,
    valueMissing: validity.valueMissing,
  };
}
