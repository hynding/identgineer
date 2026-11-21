import { describe, expect, it } from "vitest";
import { ToastQueue } from "./toast-queue";

describe("ToastQueue", () => {
  it("shows the oldest items up to the limit and queues the rest", () => {
    const queue = new ToastQueue<string>();
    const shown = queue.sync(["a", "b", "c", "d"], 3);
    expect(shown.visible).toEqual(["a", "b", "c"]);
    expect(shown.queued).toEqual(["d"]);
  });

  it("reports only the items that have just become visible", () => {
    const queue = new ToastQueue<string>();
    expect(queue.sync(["a", "b"], 2).added).toEqual(["a", "b"]);
    expect(queue.sync(["a", "b", "c"], 2).added).toEqual([]);
    expect(queue.sync(["b", "c"], 2).added).toEqual(["c"]);
  });

  it("shows at least one item whatever the limit", () => {
    const queue = new ToastQueue<string>();
    expect(queue.sync(["a", "b"], 0).visible).toEqual(["a"]);
    expect(queue.sync(["a", "b"], Number.NaN).visible).toEqual(["a"]);
  });

  it("rounds a fractional limit down", () => {
    expect(new ToastQueue<string>().sync(["a", "b", "c"], 2.7).visible).toEqual(["a", "b"]);
  });
});
