import { REGISTRY_DATA } from "./generated/registry-data.ts";
import type { RegisteredThemeId } from "./variation-state.ts";

// The added theme id rule of @identgineer/tokens (the brand id rule), embedded at build time in
// the registry data so the browser entry imports no package. It reserves every built-in id.
const RULE = REGISTRY_DATA.theme.addedIdRule;
const THEME_ID = new RegExp(RULE.pattern);
const RESERVED: ReadonlySet<string> = new Set(RULE.reserved);

/** How many live registrations hold each added id. */
const holders = new Map<string, number>();

export interface ThemeRegistration {
  readonly registered: readonly RegisteredThemeId[];
  /** Entries refused, unchanged: not a string, not a short slug, or a reserved id. */
  readonly rejected: readonly unknown[];
  /** Undoes this registration; an id another registration holds stays. Safe to call twice. */
  readonly unregister: () => void;
}

function isAddableThemeId(value: unknown): value is RegisteredThemeId {
  return (
    typeof value === "string" &&
    value.length >= RULE.minLength &&
    value.length <= RULE.maxLength &&
    THEME_ID.test(value) &&
    !RESERVED.has(value)
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
