import type { IdentityStateView, StateSource } from "./identity-types";

function isStateSource(value: unknown): value is StateSource {
  const candidate = value as Partial<Record<keyof StateSource, unknown>> | null | undefined;
  return typeof candidate?.getState === "function" && typeof candidate.subscribe === "function";
}

/**
 * Keeps a component subscribed to the client it is given: the `client` property may be set after
 * the element is connected, swapped for another, or cleared. Each bind reports the client's
 * current state, then every change, until the next bind or `unbind`.
 */
export class StateBinding<C extends StateSource> {
  private client?: C;
  private stop?: () => void;

  constructor(private readonly onState: (state: IdentityStateView, client: C) => void) {}

  bind(client: C | undefined): void {
    if (client !== undefined && client === this.client) return;
    this.unbind();
    if (!isStateSource(client)) return;
    try {
      this.stop = client.subscribe((state) => {
        this.onState(state, client);
      });
    } catch {
      return;
    }
    this.client = client;
    this.onState(client.getState(), client);
  }

  unbind(): void {
    this.stop?.();
    this.stop = undefined;
    this.client = undefined;
  }

  current(): C | undefined {
    return this.client;
  }
}
