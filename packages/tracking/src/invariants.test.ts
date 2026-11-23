import { describe, expect, it } from "vitest";
import { parseTrackingBatch } from "./parse-tracking-batch.ts";
import {
  CONSENT_KEY,
  ENDPOINT,
  HOME,
  QUEUE_KEY,
  SESSION_KEY,
  WRITE_KEY,
  createWorld,
  openTab,
  type Tab,
  type World,
} from "./test-harness.ts";
import {
  createFakeCollector,
  type CollectorAnswer,
  type FakeCollector,
} from "./testing/fake-collector.ts";
import { utf8Length } from "./utf8-length.ts";

/** A small seeded generator, so every interleaving can be replayed from its seed. */
const seeded = (seed: number) => {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const tick = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const MINUTE = 60_000;

/** Strings that must never reach the wire: a stripped query value, a referrer path, an undeclared property, an email. */
const FORBIDDEN = ["SECRET", "LEAKVALUE", "leak_", "REFPATH", "FRAGMENT", "@"];

interface Config {
  readonly maxBatchSize: number;
  readonly maxPayloadBytes: number;
  readonly maxQueueEvents: number;
  readonly maxQueueBytes: number;
  readonly maxStringLength: number;
}

const configFor = (random: () => number): Config => {
  const small = random() < 0.5;
  return {
    maxBatchSize: small ? 3 : 20,
    maxPayloadBytes: small ? 2048 : 32_768,
    maxQueueEvents: small ? 12 : 200,
    maxQueueBytes: small ? 4096 : 102_400,
    maxStringLength: small ? 1024 : 256,
  };
};

interface Scenario {
  readonly world: World;
  readonly config: Config;
  readonly tabs: { tab: Tab; collector: FakeCollector }[];
  readonly violations: string[];
  /** Every collector ever opened: a reloaded tab leaves its collector behind. */
  readonly collectors: FakeCollector[];
  /** Every session id that any tab ever held or sent. */
  readonly sessionIds: Set<string>;
  failingLocal: boolean;
  gpc: boolean;
  dnt: boolean;
  counter: number;
}

const recordGranted = (world: World): boolean => {
  try {
    const record = JSON.parse(world.local.peek(CONSENT_KEY) ?? "null") as {
      state?: unknown;
    } | null;
    return record?.state === "granted";
  } catch {
    return false;
  }
};

const effectiveConsent = (scenario: Scenario): boolean =>
  !scenario.failingLocal && !scenario.gpc && !scenario.dnt && recordGranted(scenario.world);

const open = (
  scenario: Scenario,
  slot: number,
  reuseSession: boolean,
  random: () => number,
): void => {
  const { world, config } = scenario;
  const collector = createFakeCollector({
    endpoint: ENDPOINT,
    writeKey: WRITE_KEY,
    maxPayloadBytes: config.maxPayloadBytes,
  });
  const session = reuseSession ? scenario.tabs[slot]?.tab.session : undefined;
  scenario.tabs[slot]?.tab.tracker.dispose();
  const tab = openTab(world, {
    fetch: collector.fetch,
    sendBeacon: collector.sendBeacon,
    maxBatchSize: config.maxBatchSize,
    maxPayloadBytes: config.maxPayloadBytes,
    maxQueueEvents: config.maxQueueEvents,
    maxQueueBytes: config.maxQueueBytes,
    maxStringLength: config.maxStringLength,
    allowedQueryParameters: ["utm_source"],
    autoPageViews: random() < 0.5,
    ...(session === undefined ? {} : { session }),
    ...(scenario.gpc ? { gpc: true } : {}),
    ...(scenario.dnt ? { dnt: "1" } : {}),
  });

  collector.onRequest((request) => {
    if (!effectiveConsent(scenario)) {
      scenario.violations.push(`sent a ${request.via} request without effective consent`);
    }
    if (tab.page.signals().onLine === false)
      scenario.violations.push("sent a request while offline");
    for (const word of FORBIDDEN) {
      if (request.body.includes(word)) scenario.violations.push(`the wire carries ${word}`);
    }
    const parsed = parseTrackingBatch(JSON.parse(request.body));
    if (!parsed.ok) scenario.violations.push(`a batch that does not validate: ${parsed.error}`);
    else {
      if (parsed.value.events.length > config.maxBatchSize)
        scenario.violations.push("a batch over maxBatchSize");
      for (const event of parsed.value.events) {
        if (event.session !== undefined) scenario.sessionIds.add(event.session);
      }
      // A beacon is fire-and-forget and does not count as a request in flight, but it must never
      // repeat what a fetch of the same tab is still waiting on.
      if (parsed.value.transport === "beacon") {
        const waiting = new Set(
          collector.requests
            .filter((earlier) => earlier.via === "fetch" && earlier.pending)
            .flatMap((earlier) => {
              const batch = parseTrackingBatch(JSON.parse(earlier.body));
              return batch.ok ? batch.value.events.map((event) => event.id) : [];
            }),
        );
        if (parsed.value.events.some((event) => waiting.has(event.id)))
          scenario.violations.push("a beacon repeats events of a fetch still in flight");
      }
    }
  });
  const watch = (storage: typeof world.local, name: string): void => {
    storage.observe((call) => {
      if (call.method !== "setItem" || call.key === CONSENT_KEY) return;
      if (!effectiveConsent(scenario))
        scenario.violations.push(`wrote ${call.key} to ${name} without effective consent`);
    });
  };
  watch(world.local, "localStorage");
  watch(tab.session, "sessionStorage");
  scenario.collectors.push(collector);
  scenario.tabs[slot] = { tab, collector };
};

const hostileProperties = (
  scenario: Scenario,
  random: () => number,
): Readonly<Record<string, unknown>> => {
  scenario.counter += 1;
  const n = String(scenario.counter);
  const long = "y".repeat(Math.floor(random() * random() * 6000));
  const properties: Record<string, unknown> = {
    target: random() < 0.4 ? long : `ok${n}`,
    plan: random() < 0.3 ? "a\ud800b" : "pro",
    seats:
      random() < 0.2
        ? [Number.NaN, Infinity, "3", { a: 1 }][Math.floor(random() * 4)]
        : Math.floor(random() * 10),
    trial: random() < 0.5,
    a: long,
    b: long,
    c: "c",
    d: "d",
    e: "e",
    [`leak_${n}`]: `LEAKVALUE${n}`,
  };
  if (random() < 0.1)
    return JSON.parse(`{"__proto__":{"x":1},"target":"t"}`) as Record<string, unknown>;
  if (random() < 0.05) return null as never;
  return properties;
};

type Step = (scenario: Scenario, random: () => number) => Promise<void> | void;

const anyTab = (scenario: Scenario, random: () => number) =>
  scenario.tabs[Math.floor(random() * scenario.tabs.length)] as {
    tab: Tab;
    collector: FakeCollector;
  };

const ANSWERS: readonly CollectorAnswer[] = [
  { status: 202 },
  { status: 202 },
  { status: 202 },
  { status: 500 },
  { status: 503 },
  { status: 429, headers: { "Retry-After": "7" } },
  { status: 429, headers: { "Retry-After": "garbage" } },
  { status: 429, headers: { "Retry-After": "Wed, 99 Foo 2026 99:99:99 GMT" } },
  { status: 429, headers: { "Retry-After": "99999999999" } },
  { status: 400 },
  { status: 413 },
  "network-error",
  "hang",
];

const STEPS: readonly (readonly [number, Step])[] = [
  [
    6,
    (s, r) => {
      anyTab(s, r).tab.tracker.consent.grant();
    },
  ],
  [
    2,
    (s, r) => {
      anyTab(s, r).tab.tracker.consent.deny();
    },
  ],
  [
    1,
    (s, r) => {
      anyTab(s, r).tab.tracker.consent.reset();
    },
  ],
  [
    14,
    (s, r) => {
      const names = [
        "clicked",
        "signup_completed",
        "logout",
        "wide",
        "unknown_event",
        "Bad Name",
        "__proto__",
        "constructor",
      ];
      anyTab(s, r).tab.tracker.track(
        names[Math.floor(r() * names.length)] ?? "clicked",
        hostileProperties(s, r),
      );
    },
  ],
  [
    3,
    (s, r) => {
      const { tab } = anyTab(s, r);
      for (let index = 0; index < 15; index += 1)
        tab.tracker.track("clicked", hostileProperties(s, r));
    },
  ],
  [
    4,
    (s, r) => {
      s.counter += 1;
      const path =
        r() < 0.3
          ? "javascript:alert(1)"
          : `/p${String(s.counter)}?utm_source=ok&token=SECRET${String(s.counter)}#FRAGMENT`;
      anyTab(s, r).tab.tracker.page(
        r() < 0.5 ? undefined : { path, referrer: "https://ref.example.org/REFPATH?q=SECRET" },
      );
    },
  ],
  [
    2,
    (s, r) => {
      const ids = ["user_1", "ada@example.com", "x".repeat(70), null, "ok-id"];
      anyTab(s, r).tab.tracker.identify(ids[Math.floor(r() * ids.length)] ?? null);
    },
  ],
  [
    8,
    (s, r) => {
      const amounts = [0, 1, 500, 999, 1000, 5000, 60_000, 31 * MINUTE, 25 * 60 * MINUTE];
      s.world.clock.advance(amounts[Math.floor(r() * amounts.length)] ?? 0);
    },
  ],
  [
    2,
    (s, r) => {
      anyTab(s, r).tab.page.goOffline();
    },
  ],
  [
    3,
    (s, r) => {
      anyTab(s, r).tab.page.goOnline();
    },
  ],
  [
    3,
    (s, r) => {
      anyTab(s, r).tab.page.hide();
    },
  ],
  [
    3,
    (s, r) => {
      s.counter += 1;
      const { tab } = anyTab(s, r);
      tab.page.setReferrer(`https://ref.example.org/REFPATH${String(s.counter)}?q=SECRET`);
      tab.page.navigate(
        `${HOME}n${String(s.counter)}?utm_source=ok&secret=SECRET${String(s.counter)}#FRAGMENT`,
      );
    },
  ],
  [
    2,
    (s, r) => {
      s.failingLocal = r() < 0.5;
      s.world.local.failAll(s.failingLocal);
    },
  ],
  [
    1,
    (s, r) => {
      s.world.local.failWrites(r() < 0.5);
    },
  ],
  [
    1,
    (s, r) => {
      anyTab(s, r).tab.session.failAll(r() < 0.5);
    },
  ],
  [
    2,
    (s, r) => {
      s.gpc = r() < 0.5;
      for (const { tab } of s.tabs) tab.page.setGpc(s.gpc ? true : undefined);
    },
  ],
  [
    2,
    (s, r) => {
      s.dnt = r() < 0.5;
      for (const { tab } of s.tabs) tab.page.setDnt(s.dnt ? "1" : undefined);
    },
  ],
  [
    6,
    (s, r) => {
      anyTab(s, r).collector.answer(ANSWERS[Math.floor(r() * ANSWERS.length)] ?? { status: 202 });
    },
  ],
  [
    3,
    (s, r) => {
      anyTab(s, r).collector.releaseHanging({ status: r() < 0.5 ? 202 : 500 });
    },
  ],
  [
    4,
    (s, r) => {
      void anyTab(s, r).tab.tracker.flush();
    },
  ],
  [
    2,
    (s, r) => {
      open(s, Math.floor(r() * s.tabs.length), r() < 0.5, r);
    },
  ],
  [
    2,
    (s) => {
      s.world.hub.deliver();
    },
  ],
];

const TOTAL_WEIGHT = STEPS.reduce((sum, [weight]) => sum + weight, 0);

const pickStep = (random: () => number): Step => {
  let roll = random() * TOTAL_WEIGHT;
  for (const [weight, step] of STEPS) {
    roll -= weight;
    if (roll < 0) return step;
  }
  return () => undefined;
};

const queueInvariants = (scenario: Scenario): string[] => {
  const found: string[] = [];
  const { world, config } = scenario;
  const stored = world.local.peek(QUEUE_KEY);
  if (stored !== null) {
    const parsed = JSON.parse(stored) as { events: unknown[] };
    const bytes = parsed.events.reduce<number>(
      (sum, event) => sum + utf8Length(JSON.stringify(event)),
      0,
    );
    if (parsed.events.length > config.maxQueueEvents)
      found.push("the stored queue is over its count cap");
    if (bytes > config.maxQueueBytes) found.push("the stored queue is over its byte cap");
  }
  for (const { tab } of scenario.tabs) {
    const held = tab.session.peek(SESSION_KEY);
    if (held === null) continue;
    try {
      const { id } = JSON.parse(held) as { id?: unknown };
      if (typeof id === "string") scenario.sessionIds.add(id);
    } catch {
      // A failing session storage may have left nothing readable.
    }
  }
  for (const key of world.local.keys()) {
    const value = world.local.peek(key) ?? "";
    for (const id of scenario.sessionIds) {
      if (value.includes(id)) found.push(`localStorage ${key} holds a session id`);
    }
  }
  const allowed = new Set<string>([CONSENT_KEY, QUEUE_KEY]);
  for (const key of world.local.keys())
    if (!allowed.has(key)) found.push(`unexpected localStorage key ${key}`);
  for (const { tab } of scenario.tabs) {
    for (const key of tab.session.keys())
      if (key !== SESSION_KEY) found.push(`unexpected sessionStorage key ${key}`);
  }
  return found;
};

const run = async (seed: number, steps: number): Promise<void> => {
  const random = seeded(seed);
  const world = createWorld({ seed, manualHub: seed % 3 === 0 });
  const scenario: Scenario = {
    world,
    config: configFor(random),
    tabs: [],
    violations: [],
    collectors: [],
    sessionIds: new Set(),
    failingLocal: false,
    gpc: false,
    dnt: false,
    counter: 0,
  };
  for (let slot = 0; slot < 2; slot += 1) open(scenario, slot, false, random);
  for (let step = 0; step < steps; step += 1) {
    const chosen = pickStep(random);
    await chosen(scenario, random);
    await tick();
    scenario.violations.push(...queueInvariants(scenario));
    for (const { violations } of scenario.collectors) scenario.violations.push(...violations);
    if (scenario.violations.length > 0) {
      throw new Error(
        `seed ${String(seed)}, step ${String(step)}: ${scenario.violations.join("; ")}`,
      );
    }
  }
  for (const { maxInFlight } of scenario.collectors) expect(maxInFlight).toBeLessThanOrEqual(1);
};

describe("invariants over random interleavings", () => {
  const SEEDS = Array.from({ length: 40 }, (_v, index) => index + 1);

  it.each(SEEDS)("holds for seed %i", async (seed) => {
    await run(seed, 250);
  });

  it("is not vacuous: some seed grants consent and sends a request", async () => {
    let sent = 0;
    for (const seed of SEEDS.slice(0, 5)) {
      const random = seeded(seed);
      const world = createWorld({ seed });
      const scenario: Scenario = {
        world,
        config: configFor(random),
        tabs: [],
        violations: [],
        collectors: [],
        sessionIds: new Set(),
        failingLocal: false,
        gpc: false,
        dnt: false,
        counter: 0,
      };
      open(scenario, 0, false, random);
      open(scenario, 1, false, random);
      scenario.tabs[0]?.tab.tracker.consent.grant();
      for (let index = 0; index < 30; index += 1) {
        scenario.tabs[0]?.tab.tracker.track("clicked", { target: "x" });
      }
      await tick();
      sent += scenario.tabs.reduce((sum, { collector }) => sum + collector.requests.length, 0);
    }
    expect(sent).toBeGreaterThan(0);
  });
});
