import type { RestoreSource, StateSource } from "./identity-types";

// Shared by every component on the page, so a guard and a menu given the same client restore it
// once between them.
const restored = new WeakSet();

/**
 * Resumes the session from the refresh cookie when the client does not know yet whether anyone is
 * signed in, once per client. A failure leaves the state unknown; the page may call `restore()`
 * again itself.
 */
export function restoreOnce(client: StateSource & RestoreSource): void {
  if (restored.has(client) || client.getState().status !== "unknown") return;
  restored.add(client);
  try {
    client.restore().catch(() => undefined);
  } catch {
    // A disposed client throws at once; its state stays unknown.
  }
}
