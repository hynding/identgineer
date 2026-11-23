import { describe, expect, it, vi } from "vitest";
import { CONSENT_CHANGED, createBroadcastCrossTab, isConsentNotice } from "./cross-tab.ts";

describe("isConsentNotice", () => {
  it("accepts the one message and nothing else", () => {
    expect(isConsentNotice({ type: CONSENT_CHANGED })).toBe(true);
    for (const other of [
      null,
      undefined,
      "consent-changed",
      [],
      {},
      { type: "other" },
      { type: CONSENT_CHANGED, state: "granted" },
      [CONSENT_CHANGED],
    ]) {
      expect(isConsentNotice(other)).toBe(false);
    }
  });
});

describe("createBroadcastCrossTab", () => {
  it("is absent where there is no BroadcastChannel", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    try {
      expect(createBroadcastCrossTab()).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("carries a post to a subscriber and stops after unsubscribing", async () => {
    const poster = createBroadcastCrossTab();
    const listener = createBroadcastCrossTab();
    const heard: unknown[] = [];
    const stop = listener?.subscribe((message) => heard.push(message));
    poster?.post({ type: CONSENT_CHANGED });
    await vi.waitFor(() => {
      expect(heard).toEqual([{ type: CONSENT_CHANGED }]);
    });
    stop?.();
    poster?.post({ type: CONSENT_CHANGED });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heard).toHaveLength(1);
  });
});
