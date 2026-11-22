import type { RestoreSource, StateSource } from "./identity-types";
import { restoreOnce, retryRestore, type RestoreOutcome } from "./restore-once";

type Restorable = Pick<StateSource, "getState"> & RestoreSource;

/**
 * A component's side of the shared restore: it restores the current client while its state is
 * unknown, says when that could not reach the server, and tries again when the browser comes back
 * online or `retry` is called.
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
    void attempt(client).then((outcome) => {
      if (client !== this.current() || client.getState().status !== "unknown") return;
      if (outcome !== "unreachable") return;
      window.addEventListener("online", this.retry);
      this.unreachableChanged(true);
    });
  }
}
