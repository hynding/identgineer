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
    ).toBe("idg-theme=aurora&idg-design=glass&idg-layout=bento&idg-ux=focus&idg-scheme=dark");
  });

  it("keeps defaults by default, so a link can say what the sender saw", () => {
    expect(encodeVariations(DEFAULTS)).toBe(
      "idg-theme=aurora&idg-design=flat&idg-layout=top-bar&idg-ux=comfortable&idg-scheme=system",
    );
  });

  it("omits the defaults on request, so a default state is the empty string", () => {
    expect(encodeVariations(DEFAULTS, { omitDefaults: true })).toBe("");
    expect(encodeVariations({ ...DEFAULTS, theme: "ember" }, { omitDefaults: true })).toBe(
      "idg-theme=ember",
    );
  });

  it("encodes only the axes it is given, in a stable order whatever the key order", () => {
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
    expect(decodeVariations(encodeVariations(state, { omitDefaults: true }))).toEqual(state);
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
  const ALL_FIVE =
    "idg-theme=ember&idg-design=flat&idg-layout=top-bar&idg-ux=comfortable&idg-scheme=dark";

  it("always says all five choices, defaults included, so it overrides the recipient's stored ones", () => {
    expect(variationsUrl(DEFAULTS, "https://example.com/")).toBe(
      "https://example.com/?idg-theme=aurora&idg-design=flat&idg-layout=top-bar&idg-ux=comfortable&idg-scheme=system",
    );
    expect(
      decodeVariations(new URL(variationsUrl(DEFAULTS, "https://example.com/")).searchParams),
    ).toEqual(DEFAULTS);
  });

  it("adds the choice to the base URL and keeps its other parameters and hash", () => {
    expect(variationsUrl(state, "https://example.com/docs?page=2&q=a%20b#section-3")).toBe(
      `https://example.com/docs?page=2&q=a%20b&${ALL_FIVE}#section-3`,
    );
  });

  it("replaces choices already in the base URL", () => {
    expect(variationsUrl(state, "https://example.com/?idg-theme=tidal&idg-ux=focus&keep=1")).toBe(
      `https://example.com/?keep=1&${ALL_FIVE}`,
    );
  });

  it("replaces a percent-encoded spelling of a choice, which would otherwise win on decode", () => {
    const url = variationsUrl(state, "https://example.com/?idg%2Dtheme=tidal&idg%2Dscheme=light");
    expect(url).toBe(`https://example.com/?${ALL_FIVE}`);
    expect(decodeVariations(new URL(url).searchParams)).toMatchObject({ theme: "ember" });
  });

  it("keeps every other parameter byte for byte, including look-alikes of ours", () => {
    expect(
      variationsUrl(state, "https://example.com/?idg-campaign=x&idg-themes=1&a=%20b+c&&z#h"),
    ).toBe(`https://example.com/?idg-campaign=x&idg-themes=1&a=%20b+c&&z&${ALL_FIVE}#h`);
  });

  it("works with a relative base URL", () => {
    expect(variationsUrl(state, "/docs?page=2#x")).toBe(`/docs?page=2&${ALL_FIVE}#x`);
  });

  it("produces a URL that decodes back to the state", () => {
    const url = new URL(variationsUrl(state, "https://example.com/a?b=c"));
    expect(decodeVariations(url.searchParams)).toEqual(state);
  });

  it("falls back to the default for an axis that is not valid", () => {
    expect(variationsUrl({ ...state, theme: "nope" } as never, "/")).toContain("idg-theme=aurora");
  });
});
