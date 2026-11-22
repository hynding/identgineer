import type { RestoreSource, StateSource } from "./identity-types";
import { restoreOnce, retryRestore, type RestoreOutcome } from "./restore-once";

type Restorable = Pick<StateSource, "getState"> & RestoreSource;

/**
 * A component's side of the shared restore: it restores the current client while its state is
 * unknown, says when that could not reach the server, and tries again when the browser comes back
 * online or `retry` is called. A retry while one is under way shares it, so the server is asked
 * once.
 */
export class RestoreWatch<C extends Restorable> {
  constructor(
    private readonly current: () => C | undefined,
    private readonly unreachableChanged: (unreachable: boolean) => void,
  ) {}

  start(client: C): void {
    this.run(client, restoreOnce);
  }

  readonly retry = (): void => {
    const client = this.current();
    this.stop();
    if (!client) return;
    this.unreachableChanged(false);
    this.run(client, retryRestore);
  };

  stop(): void {
    window.removeEventListener("online", this.retry);
  }

  private run(client: C, attempt: (client: C) => Promise<RestoreOutcome>): void {
    // Whatever the outcome, a client still current and still unknown has no answer (a disposed
    // client's restore settles so): the component says so, and tries again once back online.
    void attempt(client).then(() => {
      if (client !== this.current() || client.getState().status !== "unknown") return;
      window.addEventListener("online", this.retry);
      this.unreachableChanged(true);
    });
  }
}
