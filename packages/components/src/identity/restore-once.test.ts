import { describe, expect, it, vi } from "vitest";
import type { IdentityStateView } from "./identity-types";
import { restoreOnce } from "./restore-once";

function client(status: IdentityStateView["status"], restore = vi.fn(() => Promise.resolve())) {
  const state = (
    status === "signed-out" ? { status, reason: "user" } : { status }
  ) as IdentityStateView;
  return { getState: () => state, restore };
}

describe("restoreOnce", () => {
  it("restores a client whose state is unknown, once for every component on the page", () => {
    const shared = client("unknown");
    restoreOnce(shared);
    restoreOnce(shared);
    expect(shared.restore).toHaveBeenCalledTimes(1);
  });

  it("leaves a client alone once its state is known", () => {
    const known = client("signed-out");
    restoreOnce(known);
    expect(known.restore).not.toHaveBeenCalled();
  });

  it("swallows a failed restore, which leaves the state unknown for the page to retry", async () => {
    const failing = client(
      "unknown",
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    restoreOnce(failing);
    await Promise.resolve();
    expect(failing.restore).toHaveBeenCalledTimes(1);
  });

  it("swallows a restore that throws at once", () => {
    const throwing = client(
      "unknown",
      vi.fn(() => {
        throw new Error("disposed");
      }),
    );
    expect(() => {
      restoreOnce(throwing);
    }).not.toThrow();
  });
});
