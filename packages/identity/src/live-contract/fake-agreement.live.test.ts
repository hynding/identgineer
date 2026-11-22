import { beforeAll, describe, expect, it } from "vitest";
import { liveBackend, SKIP_NOTE, type LiveBackend } from "./live-backend.ts";
import {
  fakeTarget,
  realTarget,
  runScenario,
  scenarios,
  stepsOf,
  type Observation,
  type Scenario,
} from "./probes.ts";

const backend = liveBackend ?? ({} as LiveBackend);

/**
 * The fake in src/testing stands in for strapi-php in every other test of this package, so it
 * must answer each request the SDK makes with the status, error name, error fields and body
 * shape the real server does.
 */
const compare = (name: string, scenario: () => Scenario) => {
  describe(name, () => {
    const observed: { real: Observation[]; fake: Observation[] } = { real: [], fake: [] };

    beforeAll(async () => {
      const chosen = scenario();
      observed.real = await runScenario(chosen, realTarget(backend, chosen.server));
      observed.fake = await runScenario(chosen, fakeTarget(backend, chosen.server));
    }, 120_000);

    const steps = liveBackend === undefined ? [] : stepsOf(scenario());
    steps.forEach((step, index) => {
      if (step.gap === undefined) {
        it(step.name, () => {
          expect(observed.real[index]).toEqual(observed.fake[index]);
        });
        return;
      }
      const { description, today } = step.gap;
      it(`${step.name}: strapi-php answers as it does today (camis gap: ${description})`, () => {
        expect(observed.real[index]).toEqual(today);
        expect(observed.fake[index]).not.toEqual(today);
      });
      it.fails(`${step.name} (camis gap: ${description})`, () => {
        expect(observed.real[index]).toEqual(observed.fake[index]);
      });
    });
  });
};

describe.skipIf(liveBackend === undefined)(
  `the fake identity API agrees with strapi-php ${liveBackend === undefined ? SKIP_NOTE : ""}`,
  () => {
    compare("without email confirmation", () => scenarios(backend).main);
    compare("with email confirmation", () => scenarios(backend).confirmation);
    compare("over the throttle", () => scenarios(backend).throttled);
  },
);
