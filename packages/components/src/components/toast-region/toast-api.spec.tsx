import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installPopoverElement } from "../../testing/popover-element";
import "../toast/toast";
import "./toast-region";
import { toast, type ToastOptions } from "./toast-api";

interface ToastHost extends HTMLElement {
  heading?: string;
  description?: string;
  variant: string;
  duration?: number;
  actionLabel?: string;
  componentOnReady: () => Promise<HTMLElement>;
}

beforeEach(() => {
  installPopoverElement();
});

afterEach(() => {
  for (const region of document.querySelectorAll("idg-toast-region")) region.remove();
});

function shown(): ToastHost {
  const element = document.querySelector<ToastHost>("idg-toast");
  if (!element) throw new Error("no toast was shown");
  return element;
}

describe("toast()", () => {
  it("adds a region to the page when there is none, and the toast to it", () => {
    toast({ title: "Saved" });
    const regions = document.querySelectorAll("idg-toast-region");
    expect(regions).toHaveLength(1);
    expect(shown().parentElement).toBe(regions[0]);
  });

  it("uses the region already on the page", () => {
    const region = document.createElement("idg-toast-region");
    region.id = "mine";
    document.body.append(region);
    toast({ title: "Saved" });
    expect(document.querySelectorAll("idg-toast-region")).toHaveLength(1);
    expect(shown().parentElement?.id).toBe("mine");
  });

  it("hands each option to the toast as a property, the strings as text", () => {
    toast({
      title: "<b>Deleted</b>",
      description: "3 files",
      variant: "warning",
      duration: 9000,
      action: { label: "Undo", onSelect: vi.fn() },
    });
    const element = shown();
    expect(element.heading).toBe("<b>Deleted</b>");
    expect(element.description).toBe("3 files");
    expect(element.variant).toBe("warning");
    expect(element.duration).toBe(9000);
    expect(element.actionLabel).toBe("Undo");
    expect(element.querySelector("b")).toBeNull();
  });

  it("calls the action's onSelect when the action is chosen", () => {
    const onSelect = vi.fn();
    toast({ title: "Deleted", action: { label: "Undo", onSelect } });
    shown().dispatchEvent(new CustomEvent("idgAction"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("returns a handle that dismisses the toast", async () => {
    const handle = toast({ title: "Saved" });
    const element = shown();
    await element.componentOnReady();
    const reasons: string[] = [];
    element.addEventListener("idgDismiss", (event) => {
      reasons.push((event as CustomEvent<{ reason: string }>).detail.reason);
    });
    handle.dismiss();
    await vi.waitFor(() => {
      expect(element.isConnected).toBe(false);
    });
    expect(reasons).toEqual(["api"]);
  });

  it("accepts strings only, so markup or objects can never reach the page", () => {
    const invalid: unknown[] = [
      { title: 42 },
      { title: "" },
      { title: { toString: () => "<b>x</b>" } },
      { title: "Saved", description: ["x"] },
      { title: "Saved", variant: "loud" },
      { title: "Saved", duration: -1 },
      { title: "Saved", duration: Number.NaN },
      { title: "Saved", action: { label: 1, onSelect: () => undefined } },
      { title: "Saved", action: { label: "Undo", onSelect: "alert(1)" } },
      null,
    ];
    for (const options of invalid) {
      expect(() => toast(options as ToastOptions)).toThrow(TypeError);
    }
    expect(document.querySelector("idg-toast")).toBeNull();
  });
});
