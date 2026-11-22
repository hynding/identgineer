import { describe, expect, it } from "vitest";
import { URL_PARAM_PREFIX } from "./constants.ts";
import { decodeVariations, encodeVariations, variationsUrl } from "./url.ts";
import type { VariationState } from "./variation-state.ts";

const DEFAULTS: VariationState = {
  theme: "aurora",
  design: "flat",
  layout: "top-bar",
  ux: "comfortable",
  scheme: "system",
};

describe("encodeVariations", () => {
  it("uses prefixed parameter names so it cannot collide with a site's own", () => {
    expect(URL_PARAM_PREFIX).toBe("idg-");
    expect(
      encodeVariations({
        theme: "aurora",
        design: "glass",
        layout: "bento",
        ux: "focus",
        scheme: "dark",
      }),
    ).toBe("idg-design=glass&idg-layout=bento&idg-ux=focus&idg-scheme=dark");
  });

  it("omits the defaults, so a default state is the empty string", () => {
    expect(encodeVariations(DEFAULTS)).toBe("");
    expect(encodeVariations({ ...DEFAULTS, theme: "ember" })).toBe("idg-theme=ember");
  });

  it("is stable whatever the order of the keys", () => {
    expect(encodeVariations({ scheme: "light", theme: "ember" })).toBe(
      "idg-theme=ember&idg-scheme=light",
    );
  });

  it("encodes only valid ids", () => {
    expect(encodeVariations({ theme: "ember&x=1", design: "glass" } as never)).toBe(
      "idg-design=glass",
    );
  });
});

describe("decodeVariations", () => {
  it("round-trips every non-default choice", () => {
    const state: VariationState = {
      theme: "terminal",
      design: "pixel",
      layout: "immersive",
      ux: "power",
      scheme: "light",
    };
    expect(decodeVariations(encodeVariations(state))).toEqual(state);
  });

  it("accepts a search string with or without the leading question mark, and URLSearchParams", () => {
    expect(decodeVariations("?idg-theme=ember")).toEqual({ theme: "ember" });
    expect(decodeVariations("idg-theme=ember")).toEqual({ theme: "ember" });
    expect(decodeVariations(new URLSearchParams("idg-theme=ember"))).toEqual({ theme: "ember" });
  });

  it("ignores parameters that are not its own", () => {
    expect(decodeVariations("?theme=ember&layout=bento&page=2&idg-ux=focus")).toEqual({
      ux: "focus",
    });
  });

  it("validates exactly like the registry allowlist", () => {
    expect(
      decodeVariations(
        "?idg-theme=EMBER&idg-design=%20glass&idg-layout=__proto__&idg-ux=focus&idg-scheme=sepia",
      ),
    ).toEqual({ ux: "focus" });
  });

  it("takes the first of a repeated parameter", () => {
    expect(decodeVariations("?idg-theme=ember&idg-theme=tidal")).toEqual({ theme: "ember" });
  });

  it("accepts an explicit system scheme", () => {
    expect(decodeVariations("?idg-scheme=system")).toEqual({ scheme: "system" });
  });

  it("returns nothing for an empty or hostile search and never throws", () => {
    expect(decodeVariations("")).toEqual({});
    expect(decodeVariations("?%E0%A4%A&idg-theme=")).toEqual({});
    expect(decodeVariations(`?idg-theme=${"a".repeat(100_000)}`)).toEqual({});
  });
});

describe("variationsUrl", () => {
  const state = { ...DEFAULTS, theme: "ember", scheme: "dark" } as const;

  it("adds the choice to the base URL and keeps its other parameters and hash", () => {
    expect(variationsUrl(state, "https://example.com/docs?page=2&q=a%20b#section-3")).toBe(
      "https://example.com/docs?page=2&q=a%20b&idg-theme=ember&idg-scheme=dark#section-3",
    );
  });

  it("replaces choices already in the base URL, defaults included", () => {
    expect(
      variationsUrl(DEFAULTS, "https://example.com/?idg-theme=ember&idg-ux=focus&keep=1"),
    ).toBe("https://example.com/?keep=1");
  });

  it("adds no query at all when there is nothing to say", () => {
    expect(variationsUrl(DEFAULTS, "https://example.com/path#top")).toBe(
      "https://example.com/path#top",
    );
  });

  it("works with a relative base URL", () => {
    expect(variationsUrl(state, "/docs?page=2#x")).toBe(
      "/docs?page=2&idg-theme=ember&idg-scheme=dark#x",
    );
  });

  it("produces a URL that decodes back to the state", () => {
    const url = new URL(variationsUrl(state, "https://example.com/a?b=c"));
    expect(decodeVariations(url.searchParams)).toEqual({ theme: "ember", scheme: "dark" });
  });
});
