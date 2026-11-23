import { describe, expect, it } from "vitest";
import type { FetchInit, FetchResponseLike } from "./fetch-like.ts";
import type { NavigatorSignals, PageEnvironment, Unsubscribe } from "./page-environment.ts";
import { ENDPOINT, WRITE_KEY, createWorld, grantedTab, settle } from "./test-harness.ts";

// Injected environments are often objects whose methods need their `this`: a clock class, a
// page class, and `fetch` itself, which throws if it is called on anything but the global.
class ClassPage implements PageEnvironment {
  readonly #href = "https://shop.example.com/";
  location(): string {
    return this.#href;
  }
  referrer(): string {
    return "";
  }
  signals(): NavigatorSignals {
    return { onLine: true };
  }
  onHidden(): Unsubscribe {
    return () => undefined;
  }
  onOnline(): Unsubscribe {
    return () => undefined;
  }
  onNavigate(): Unsubscribe {
    return () => undefined;
  }
  onStorage(): Unsubscribe {
    return () => undefined;
  }
}

describe("injected environments", () => {
  it("are called as the methods they are, and fetch without a receiver", async () => {
    const world = createWorld();
    const requests: string[] = [];
    function strictFetch(this: unknown, url: string, init: FetchInit): Promise<FetchResponseLike> {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      requests.push(`${url} ${init.headers["X-Idg-Write-Key"] ?? ""}`);
      return Promise.resolve({ status: 202, headers: { get: () => null } });
    }
    const clock = {
      time: world.clock,
      now(): number {
        return this.time.now();
      },
      setTimeout(callback: () => void, delay: number): unknown {
        return this.time.setTimeout(callback, delay);
      },
      clearTimeout(handle: unknown): void {
        this.time.clearTimeout(handle);
      },
    };
    const tab = grantedTab(world, { page: new ClassPage(), clock, fetch: strictFetch });
    tab.tracker.track("logout");
    await tab.tracker.flush();
    await settle();
    expect(requests).toEqual([`${ENDPOINT} ${WRITE_KEY}`]);
  });
});
