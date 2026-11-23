import { describe, expect, it } from "vitest";
import { createEventQueue, type QueueEntry } from "./event-queue.ts";

const entry = (id: string, bytes = 100): QueueEntry => ({
  event: { id: id.padEnd(22, "A"), name: "clicked", at: 1, session: "S".repeat(22) },
  bytes,
});
const ids = (queue: ReturnType<typeof createEventQueue>): string[] =>
  queue.entries().map((item) => item.event.id.slice(0, 1));

describe("createEventQueue", () => {
  it("keeps entries in the order they came and counts them and their bytes", () => {
    const queue = createEventQueue({ maxEvents: 10, maxBytes: 10_000 });
    expect(queue.push(entry("a", 10))).toBe(0);
    queue.push(entry("b", 20));
    expect(ids(queue)).toEqual(["a", "b"]);
    expect(queue.size()).toBe(2);
    expect(queue.bytes()).toBe(30);
  });

  it("drops the oldest entries past the count cap and says how many", () => {
    const queue = createEventQueue({ maxEvents: 3, maxBytes: 10_000 });
    for (const id of ["a", "b", "c"]) queue.push(entry(id));
    expect(queue.push(entry("d"))).toBe(1);
    expect(ids(queue)).toEqual(["b", "c", "d"]);
  });

  it("drops the oldest entries past the byte cap", () => {
    const queue = createEventQueue({ maxEvents: 100, maxBytes: 250 });
    queue.push(entry("a"));
    queue.push(entry("b"));
    expect(queue.push(entry("c"))).toBe(1);
    expect(ids(queue)).toEqual(["b", "c"]);
    expect(queue.bytes()).toBe(200);
  });

  it("drops an entry that alone is over the byte cap, and nothing else", () => {
    const queue = createEventQueue({ maxEvents: 100, maxBytes: 250 });
    queue.push(entry("a"));
    expect(queue.push(entry("b", 300))).toBe(1);
    expect(ids(queue)).toEqual(["a"]);
  });

  it("removes entries by id", () => {
    const queue = createEventQueue({ maxEvents: 10, maxBytes: 10_000 });
    for (const id of ["a", "b", "c"]) queue.push(entry(id));
    queue.remove(new Set([entry("a").event.id, entry("c").event.id, "unknown"]));
    expect(ids(queue)).toEqual(["b"]);
    expect(queue.bytes()).toBe(100);
  });

  it("puts older entries in front and still holds its caps", () => {
    const queue = createEventQueue({ maxEvents: 3, maxBytes: 10_000 });
    queue.push(entry("c"));
    queue.push(entry("d"));
    expect(queue.prepend([entry("a"), entry("b")])).toBe(1);
    expect(ids(queue)).toEqual(["b", "c", "d"]);
  });

  it("empties", () => {
    const queue = createEventQueue({ maxEvents: 10, maxBytes: 10_000 });
    queue.push(entry("a"));
    queue.clear();
    expect(queue.size()).toBe(0);
    expect(queue.bytes()).toBe(0);
  });

  it("hands out a copy, so a caller cannot change it", () => {
    const queue = createEventQueue({ maxEvents: 10, maxBytes: 10_000 });
    queue.push(entry("a"));
    (queue.entries() as QueueEntry[]).pop();
    expect(queue.size()).toBe(1);
  });
});
