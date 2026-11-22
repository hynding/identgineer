import { describe, expect, it, vi } from "vitest";
import type { IdentityStateView } from "./identity-types";
import { restoreOnce, retryRestore } from "./restore-once";

function client(status: IdentityStateView["status"], restore = vi.fn(() => Promise.resolve())) {
  const state = (
    status === "signed-out" ? { status, reason: "user" } : { status }
  ) as IdentityStateView;
  return { getState: () => state, restore };
}

const failing = () =>
  client(
    "unknown",
    vi.fn(() => Promise.reject(new Error("network"))),
  );

describe("restoreOnce", () => {
  it("restores a client whose state is unknown, one attempt shared by every component", async () => {
    const shared = client("unknown");
    const first = restoreOnce(shared);
    const second = restoreOnce(shared);
    expect(shared.restore).toHaveBeenCalledTimes(1);
    expect(await first).toBe("done");
    expect(await second).toBe("done");
  });

  it("leaves a client alone once its state is known", async () => {
    const known = client("signed-out");
    expect(await restoreOnce(known)).toBe("done");
    expect(known.restore).not.toHaveBeenCalled();
  });

  it("reports a failed restore as unreachable, and does not try again by itself", async () => {
    const offline = failing();
    expect(await restoreOnce(offline)).toBe("unreachable");
    expect(await restoreOnce(offline)).toBe("unreachable");
    expect(offline.restore).toHaveBeenCalledTimes(1);
  });

  it("tries again when asked to, after a failure", async () => {
    const offline = failing();
    await restoreOnce(offline);
    offline.restore.mockImplementation(() => Promise.resolve());
    expect(await retryRestore(offline)).toBe("done");
    expect(offline.restore).toHaveBeenCalledTimes(2);
  });

  it("reports a restore that throws at once as unreachable", async () => {
    const throwing = client(
      "unknown",
      vi.fn(() => {
        throw new Error("disposed");
      }),
    );
    expect(await restoreOnce(throwing)).toBe("unreachable");
  });
});
