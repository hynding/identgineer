import { describe, expect, it } from "vitest";
import { createMemoryLocks } from "./memory-locks.ts";

describe("createMemoryLocks", () => {
  it("runs callbacks for one name one at a time, in order", async () => {
    const locks = createMemoryLocks();
    const order: string[] = [];
    let release = (): void => undefined;
    const first = locks.request("a", async () => {
      order.push("first start");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      order.push("first end");
      return 1;
    });
    const second = locks.request("a", () => {
      order.push("second");
      return Promise.resolve(2);
    });
    await Promise.resolve();
    expect(order).toEqual(["first start"]);
    release();
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(order).toEqual(["first start", "first end", "second"]);
  });

  it("releases the lock when a callback fails", async () => {
    const locks = createMemoryLocks();
    await expect(locks.request("a", () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    await expect(locks.request("a", () => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("throws on a request for a lock from within its holder, which would wait for itself forever", async () => {
    const reported: unknown[] = [];
    const locks = createMemoryLocks({ onNestedRequest: (error) => reported.push(error) });
    const outcome = await locks.request("a", async () => {
      await Promise.resolve();
      try {
        await locks.request("a", () => Promise.resolve("inner"));
        return "granted";
      } catch (error) {
        return (error as Error).message;
      }
    });
    expect(outcome).toMatch(/already holds/);
    expect(reported).toHaveLength(1);
  });

  it("lets a holder of one lock request another, and anyone request it once let go", async () => {
    const reported: unknown[] = [];
    const locks = createMemoryLocks({ onNestedRequest: (error) => reported.push(error) });
    let later: Promise<string> = Promise.resolve("");
    const outcome = await locks.request("a", async () => {
      later = new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      }).then(() => "outside");
      return locks.request("b", () => Promise.resolve("b"));
    });
    expect(outcome).toBe("b");
    await expect(locks.request("a", () => later)).resolves.toBe("outside");
    expect(reported).toHaveLength(0);
  });
});
