import { describe, expect, it } from "vitest";
import { createIdentityClient } from "./identity-client.ts";

const BASE_URL = "https://cms.example.test";

describe("numeric options", () => {
  it.each(["accessTokenLifetimeSeconds", "requestTimeoutMs"] as const)(
    "refuses a %s that is not a positive number a timer can hold",
    (option) => {
      const tooLong = option === "requestTimeoutMs" ? 2 ** 31 : Math.ceil(2 ** 31 / 1000);
      for (const value of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY, Number("10m"), tooLong]) {
        expect(() => createIdentityClient({ baseUrl: BASE_URL, [option]: value })).toThrow(
          TypeError,
        );
      }
    },
  );

  it("takes positive numbers", () => {
    const client = createIdentityClient({
      baseUrl: BASE_URL,
      accessTokenLifetimeSeconds: 0.5,
      requestTimeoutMs: 1,
      channelName: "identgineer-options",
    });
    client.dispose();
  });
});
