import { REGISTRY } from "./registry.ts";
import type { RegisteredThemeId } from "./variation-state.ts";

const MIN_LENGTH = 2;
const MAX_LENGTH = 32;
// The id rule of @identgineer/brand: lower-case ASCII words joined by single hyphens, starting with
// a letter. Every brand id passes it; nothing that could need escaping in an attribute, a URL or
// a selector does.
const THEME_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

// Built-in ids are already accepted; the two prototype names that fit the rule are refused so no
// added id can ever shadow an object member, whatever a later lookup is keyed by.
const REFUSED: ReadonlySet<string> = new Set([
  ...REGISTRY.theme.variations.map(({ id }) => id),
  "constructor",
  "prototype",
]);

/** How many live registrations hold each added id. */
const holders = new Map<string, number>();

export interface ThemeRegistration {
  readonly registered: readonly RegisteredThemeId[];
  /** Entries refused, unchanged: not a string, not a short slug, or a built-in id. */
  readonly rejected: readonly unknown[];
  /** Undoes this registration; an id another registration holds stays. Safe to call twice. */
  readonly unregister: () => void;
}

function isAddableThemeId(value: unknown): value is RegisteredThemeId {
  return (
    typeof value === "string" &&
    value.length >= MIN_LENGTH &&
    value.length <= MAX_LENGTH &&
    THEME_ID.test(value) &&
    !REFUSED.has(value)
  );
}

export function isRegisteredThemeId(value: string): boolean {
  return holders.has(value);
}

function entriesOf(ids: unknown): readonly unknown[] {
  try {
    return Array.isArray(ids) ? Array.from(ids as readonly unknown[]) : [];
  } catch {
    // A revoked or hostile proxy: register nothing rather than throw.
    return [];
  }
}

/**
 * Adds theme ids beyond the built-in eight (themes generated from a brand kit), so the theme
 * check accepts them everywhere: applying, reading attributes back, URLs and storage. Only the
 * theme axis changes, and only for ids that pass the brand id rule; the registry, its previews and
 * shuffling stay with the built-in themes. The bootstrap script embeds the built-in ids at build
 * time and does not see added ones.
 */
export function registerThemeIds(ids: unknown): ThemeRegistration {
  const registered: RegisteredThemeId[] = [];
  const rejected: unknown[] = [];
  for (const id of entriesOf(ids)) {
    if (isAddableThemeId(id) && !registered.includes(id)) registered.push(id);
    else if (!isAddableThemeId(id)) rejected.push(id);
  }
  for (const id of registered) holders.set(id, (holders.get(id) ?? 0) + 1);
  let active = true;
  const unregister = (): void => {
    if (!active) return;
    active = false;
    for (const id of registered) {
      const count = (holders.get(id) ?? 1) - 1;
      if (count > 0) holders.set(id, count);
      else holders.delete(id);
    }
  };
  return Object.freeze({
    registered: Object.freeze(registered),
    rejected: Object.freeze(rejected),
    unregister,
  });
}
