/** The part of the Web Locks API (`navigator.locks`) the client uses. */
export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export const REFRESH_LOCK = "identgineer-identity-refresh";

/**
 * The given lock manager, or the browser's when the option is left out; `null` turns locking off.
 * Without one, each tab refreshes on its own and retries once when another tab rotated first.
 */
export const resolveLocks = (
  option: LockManagerLike | null | undefined,
): LockManagerLike | null => {
  if (option !== undefined) return option;
  const navigator = (globalThis as { navigator?: { locks?: Partial<LockManagerLike> } }).navigator;
  const locks = navigator?.locks;
  return typeof locks?.request === "function" ? (locks as LockManagerLike) : null;
};
