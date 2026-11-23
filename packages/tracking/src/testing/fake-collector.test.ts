import { describe, expect, it } from "vitest";
import type { FetchInit } from "../fetch-like.ts";
import { createFakeCollector } from "./fake-collector.ts";

const KEY = "write_key_0123456789";
const ENDPOINT = "https://collect.example.com/v1/events";

const event = (id: string) => ({
  id: id.padEnd(22, "A"),
  name: "clicked",
  at: 1,
  session: "S".repeat(22),
});
const body = (...ids: string[]): string =>
  JSON.stringify({ v: 1, sentAt: 2, transport: "fetch", events: ids.map(event) });

const init = (overrides: Partial<FetchInit> = {}, text = body("a")): FetchInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Idg-Write-Key": KEY },
  body: text,
  credentials: "omit",
  mode: "cors",
  referrerPolicy: "no-referrer",
  cache: "no-store",
  redirect: "error",
  ...overrides,
});

const collector = () => createFakeCollector({ endpoint: ENDPOINT, writeKey: KEY });

describe("createFakeCollector", () => {
  it("records a well-formed fetch, answers 202 and finds no violation", async () => {
    const fake = collector();
    const response = await fake.fetch(ENDPOINT, init());
    expect(response.status).toBe(202);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.via).toBe("fetch");
    expect(fake.batches()).toHaveLength(1);
    expect(fake.deliveredEvents().map((delivered) => delivered.name)).toEqual(["clicked"]);
    expect(fake.violations).toEqual([]);
  });

  it("answers from a script, then with its default", async () => {
    const fake = collector();
    fake.answer({ status: 429, headers: { "Retry-After": "30" } }, "network-error");
    const first = await fake.fetch(ENDPOINT, init());
    expect(first.status).toBe(429);
    expect(first.headers.get("retry-after")).toBe("30");
    await expect(fake.fetch(ENDPOINT, init())).rejects.toBeInstanceOf(TypeError);
    expect((await fake.fetch(ENDPOINT, init())).status).toBe(202);
    fake.setDefault({ status: 500 });
    expect((await fake.fetch(ENDPOINT, init())).status).toBe(500);
  });

  it("delivers only the events of batches it accepted", async () => {
    const fake = collector();
    fake.answer({ status: 503 });
    await fake.fetch(ENDPOINT, init({}, body("a")));
    await fake.fetch(ENDPOINT, init({}, body("b")));
    expect(fake.batches()).toHaveLength(2);
    expect(fake.deliveredEvents().map((delivered) => delivered.id.slice(0, 1))).toEqual(["b"]);
  });

  it("keeps a request in flight until it is released, and counts them", async () => {
    const fake = collector();
    fake.answer("hang");
    const pending = fake.fetch(ENDPOINT, init());
    expect(fake.inFlight).toBe(1);
    expect(fake.maxInFlight).toBe(1);
    fake.releaseHanging({ status: 202 });
    expect((await pending).status).toBe(202);
    expect(fake.inFlight).toBe(0);
    expect(fake.violations).toEqual([]);
  });

  it("flags a second request in flight", async () => {
    const fake = collector();
    fake.answer("hang");
    const first = fake.fetch(ENDPOINT, init());
    await fake.fetch(ENDPOINT, init());
    fake.releaseHanging();
    await first;
    expect(fake.maxInFlight).toBe(2);
    expect(fake.violations.join("\n")).toContain("in flight");
  });

  it("flags a request that breaks the contract", async () => {
    const cases: [string, () => Promise<unknown>][] = [
      ["url", () => fake.fetch("https://other.example/", init())],
      [
        "write key",
        () => fake.fetch(ENDPOINT, init({ headers: { "Content-Type": "application/json" } })),
      ],
      ["content type", () => fake.fetch(ENDPOINT, init({ headers: { "X-Idg-Write-Key": KEY } }))],
      ["credentials", () => fake.fetch(ENDPOINT, init({ credentials: "include" as never }))],
      ["referrer policy", () => fake.fetch(ENDPOINT, init({ referrerPolicy: "origin" as never }))],
      ["cache", () => fake.fetch(ENDPOINT, init({ cache: "default" as never }))],
      ["mode", () => fake.fetch(ENDPOINT, init({ mode: "no-cors" as never }))],
      ["batch", () => fake.fetch(ENDPOINT, init({}, "{}"))],
      ["json", () => fake.fetch(ENDPOINT, init({}, "not json"))],
      [
        "body key",
        () =>
          fake.fetch(
            ENDPOINT,
            init(
              {},
              JSON.stringify({
                v: 1,
                sentAt: 1,
                transport: "fetch",
                writeKey: KEY,
                events: [event("a")],
              }),
            ),
          ),
      ],
    ];
    let fake = collector();
    for (const [rule, send] of cases) {
      fake = collector();
      await send();
      expect(fake.violations.join("\n"), rule).toContain(rule);
    }
  });

  it("flags a fetch body that says it is a beacon, and a beacon that says it is a fetch", async () => {
    const asBeacon = collector();
    await asBeacon.fetch(
      ENDPOINT,
      init({}, JSON.stringify({ v: 1, sentAt: 2, transport: "beacon", events: [event("a")] })),
    );
    expect(asBeacon.violations.join("\n")).toContain("transport");
    const asFetch = collector();
    asFetch.sendBeacon(ENDPOINT, body("a"));
    expect(asFetch.violations.join("\n")).toContain("transport");
  });

  it("settles a request that is aborted, so it is no longer in flight", async () => {
    const fake = collector();
    fake.answer("hang");
    const controller = new AbortController();
    const pending = fake.fetch(ENDPOINT, init({ signal: controller.signal }));
    expect(fake.inFlight).toBe(1);
    expect(fake.requests[0]?.pending).toBe(true);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.inFlight).toBe(0);
    expect(fake.requests[0]?.pending).toBe(false);
  });

  it("flags a body over its payload cap", async () => {
    const fake = createFakeCollector({ endpoint: ENDPOINT, writeKey: KEY, maxPayloadBytes: 100 });
    await fake.fetch(ENDPOINT, init());
    expect(fake.violations.join("\n")).toContain("payload");
  });

  it("takes a beacon with the key in its body and none in the URL", () => {
    const fake = collector();
    const text = JSON.stringify({
      v: 1,
      sentAt: 2,
      transport: "beacon",
      writeKey: KEY,
      events: [event("a")],
    });
    expect(fake.sendBeacon(ENDPOINT, text)).toBe(true);
    expect(fake.requests[0]?.via).toBe("beacon");
    expect(fake.deliveredEvents()).toHaveLength(1);
    expect(fake.violations).toEqual([]);
  });

  it("flags a beacon without the key or with it in the URL", () => {
    const missing = collector();
    missing.sendBeacon(ENDPOINT, body("a"));
    expect(missing.violations.join("\n")).toContain("write key");
    const inUrl = collector();
    inUrl.sendBeacon(
      `${ENDPOINT}?key=${KEY}`,
      JSON.stringify({ v: 1, sentAt: 2, transport: "beacon", writeKey: KEY, events: [event("a")] }),
    );
    expect(inUrl.violations.join("\n")).toContain("url");
  });

  it("refuses a beacon when told to, and records nothing", () => {
    const fake = collector();
    fake.beaconAccepts = false;
    expect(fake.sendBeacon(ENDPOINT, "x")).toBe(false);
    expect(fake.requests).toEqual([]);
  });

  it("tells an observer about each request before it answers", async () => {
    const fake = collector();
    const seen: string[] = [];
    fake.onRequest((request) => seen.push(request.via));
    await fake.fetch(ENDPOINT, init());
    fake.sendBeacon(ENDPOINT, "x");
    expect(seen).toEqual(["fetch", "beacon"]);
  });
});
