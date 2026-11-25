import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import { readFileSync } from "node:fs";
import { logoDataUrl, parseBrandKit } from "@identgineer/brand";
import "./brand-logo";

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);
const kit = parseBrandKit(
  JSON.parse(readFileSync(new URL("harbour-lights.kit.json", FIXTURES), "utf8")),
);
if (!kit.ok || kit.kit.logo === undefined || kit.kit.mark === undefined) {
  throw new Error("the fixture kit has no logo and mark");
}
const LOGO = kit.kit.logo;
const MARK = kit.kit.mark;

const shadow = (root: HTMLElement): ShadowRoot => {
  if (!root.shadowRoot) throw new Error("idg-brand-logo has no shadow root");
  return root.shadowRoot;
};
const image = (root: HTMLElement) => shadow(root).querySelector("img");
const part = (root: HTMLElement, name: string) => shadow(root).querySelector(`[part="${name}"]`);

// What a hostile or merely edited logo looks like once it is a string in a prop. None is the
// sanitiser's own output.
const NOT_SANITISED: readonly (readonly [string, string])[] = [
  [
    "a script",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script></svg>',
  ],
  [
    "an event handler",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" onload="alert(1)"/>',
  ],
  [
    "an external reference",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image href="https://example.com/x.png"/></svg>',
  ],
  [
    "a foreignObject",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><foreignObject><iframe src="https://example.com"/></foreignObject></svg>',
  ],
  [
    "a javascript url",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><a href="javascript:alert(1)"><rect width="1" height="1"/></a></svg>',
  ],
  ["an svg the sanitiser would change", LOGO.replace("</svg>", "\n</svg>")],
  ["markup around the logo", `<img src=x onerror=alert(1)>${LOGO}`],
  ["a data url", logoDataUrl(LOGO)],
];

describe("idg-brand-logo with a sanitised logo", () => {
  it("draws it through an image whose source is the logo's data url, and nothing else", async () => {
    const { root } = await render(<idg-brand-logo logo={LOGO} name="Harbour Lights" />);
    const picture = image(root);
    expect(picture?.getAttribute("src")).toBe(logoDataUrl(LOGO));
    expect(picture?.getAttribute("part")).toBe("image");
    expect(shadow(root).querySelectorAll("img")).toHaveLength(1);
    expect(part(root, "wordmark")).toBeNull();
  });

  it("never puts the logo's markup in the page: no svg, use, object or embed, and no logo text", async () => {
    const { root } = await render(<idg-brand-logo logo={LOGO} name="Harbour Lights" />);
    expect(
      shadow(root).querySelectorAll("svg, use, object, embed, iframe, image, path, rect"),
    ).toHaveLength(0);
    const elements = [...shadow(root).querySelectorAll("*")].map((element) => element.localName);
    expect(elements.filter((name) => name !== "img")).not.toContain("svg");
    expect(shadow(root).textContent).not.toContain("<svg");
    expect(root.innerHTML).not.toContain("<svg");
    // The title inside the logo is not the accessible name: the brand's name is.
    expect(shadow(root).textContent).not.toContain("Harbour Lights");
  });

  it("gives the image explicit size from the logo's frame, async decoding and no way to load another file", async () => {
    const { root } = await render(<idg-brand-logo logo={LOGO} name="Harbour Lights" />);
    const picture = image(root);
    expect(picture?.getAttribute("width")).toBe("3000");
    expect(picture?.getAttribute("height")).toBe("1000");
    expect(picture?.getAttribute("decoding")).toBe("async");
    for (const attribute of ["srcset", "sizes", "crossorigin", "usemap", "ismap"]) {
      expect(picture?.hasAttribute(attribute), attribute).toBe(false);
    }
    expect(picture?.getAttribute("src")).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it("has no inline style and no event handler on anything it draws", async () => {
    const { root } = await render(<idg-brand-logo logo={LOGO} name="Harbour Lights" />);
    for (const element of shadow(root).querySelectorAll("*")) {
      expect(element.hasAttribute("style")).toBe(false);
      const names = Array.from(element.attributes, (attribute) => attribute.name);
      expect(names.filter((name) => name.startsWith("on"))).toEqual([]);
    }
  });

  it("names the image after the brand", async () => {
    const { root } = await render(<idg-brand-logo logo={LOGO} name="Harbour Lights" />);
    expect(image(root)?.getAttribute("alt")).toBe("Harbour Lights");
  });

  it("is decoration, with an empty alt, beside the same name written out", async () => {
    const { root } = await render(<idg-brand-logo logo={LOGO} name="Harbour Lights" decorative />);
    expect(image(root)?.getAttribute("alt")).toBe("");
  });

  it("has an empty alt when it has no name to give, never the logo's own text", async () => {
    const { root } = await render(<idg-brand-logo logo={LOGO} />);
    expect(image(root)?.getAttribute("alt")).toBe("");
  });

  it("neutralises and cuts the name used as alt", async () => {
    const hostile = `Pay‮fdp.exe ${"x".repeat(100)}`;
    const { root } = await render(<idg-brand-logo logo={LOGO} name={hostile} />);
    const alt = image(root)?.getAttribute("alt") ?? "";
    expect(alt).not.toContain("‮");
    expect(Array.from(alt)).toHaveLength(60);
  });

  it("draws the mark in the same way", async () => {
    const { root } = await render(
      <idg-brand-logo logo={MARK} variant="mark" name="Harbour Lights" />,
    );
    expect(image(root)?.getAttribute("src")).toBe(logoDataUrl(MARK));
    expect(image(root)?.getAttribute("width")).toBe("1000");
    expect(shadow(root).querySelector(".variant-mark")).not.toBeNull();
  });

  it.each(["xs", "sm", "md", "lg", "xl"] as const)("applies size %s", async (size) => {
    const { root } = await render(<idg-brand-logo logo={LOGO} name="Harbour Lights" size={size} />);
    expect(shadow(root).querySelector(`.size-${size}`)).not.toBeNull();
    expect(root.getAttribute("size")).toBe(size);
  });

  it("falls back to the medium size and the logo variant for values it does not know", async () => {
    const { root } = await render(
      <idg-brand-logo
        logo={LOGO}
        name="Harbour Lights"
        size={"huge" as "md"}
        variant={"banner" as "logo"}
      />,
    );
    expect(shadow(root).querySelector(".size-md.variant-logo")).not.toBeNull();
  });

  it("follows a new logo, and drops it when the new one is not sanitised", async () => {
    const { root, setProps, waitForChanges } = await render(
      <idg-brand-logo logo={LOGO} name="Harbour Lights" />,
    );
    await setProps({ logo: MARK });
    expect(image(root)?.getAttribute("src")).toBe(logoDataUrl(MARK));
    await setProps({ logo: NOT_SANITISED[0]?.[1] });
    await waitForChanges();
    expect(image(root)).toBeNull();
    expect(part(root, "wordmark")?.textContent).toBe("Harbour Lights");
  });
});

describe("idg-brand-logo when the image cannot load", () => {
  it("shows the name instead, as a browser that refuses a data url would leave it", async () => {
    const { root, waitForChanges } = await render(
      <idg-brand-logo logo={LOGO} name="Harbour Lights" />,
    );
    image(root)?.dispatchEvent(new Event("error"));
    await waitForChanges();
    expect(image(root)).toBeNull();
    expect(part(root, "wordmark")?.textContent).toBe("Harbour Lights");
  });

  it("tries a new logo after a failure", async () => {
    const { root, waitForChanges, setProps } = await render(
      <idg-brand-logo logo={LOGO} name="Harbour Lights" />,
    );
    image(root)?.dispatchEvent(new Event("error"));
    await waitForChanges();
    await setProps({ logo: MARK });
    expect(image(root)?.getAttribute("src")).toBe(logoDataUrl(MARK));
  });
});

describe("idg-brand-logo without a usable logo", () => {
  it.each(NOT_SANITISED)(
    "never draws %s, and shows the name as a wordmark instead",
    async (_name, logo) => {
      const { root } = await render(<idg-brand-logo logo={logo} name="Harbour Lights" />);
      expect(image(root)).toBeNull();
      expect(shadow(root).querySelectorAll("svg, script, foreignobject, iframe, a")).toHaveLength(
        0,
      );
      expect(part(root, "wordmark")?.textContent).toBe("Harbour Lights");
      expect(shadow(root).textContent).not.toContain("alert");
      expect(shadow(root).innerHTML).not.toContain("javascript:");
    },
  );

  it("shows the name as text, a wordmark, which is its own accessible name", async () => {
    const { root } = await render(<idg-brand-logo name="Harbour Lights" />);
    const wordmark = part(root, "wordmark");
    expect(wordmark?.textContent).toBe("Harbour Lights");
    expect(wordmark?.hasAttribute("aria-hidden")).toBe(false);
    expect(wordmark?.hasAttribute("role")).toBe(false);
  });

  it("hides the wordmark from assistive technology when it is decoration", async () => {
    const { root } = await render(<idg-brand-logo name="Harbour Lights" decorative />);
    expect(part(root, "wordmark")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows a monogram for the mark: the first letter of the first and last word, named for the brand", async () => {
    const { root } = await render(<idg-brand-logo name="Harbour Lights" variant="mark" />);
    const monogram = part(root, "monogram");
    expect(monogram?.getAttribute("role")).toBe("img");
    expect(monogram?.getAttribute("aria-label")).toBe("Harbour Lights");
    const letters = monogram?.querySelector(".letters");
    expect(letters?.textContent).toBe("HL");
    expect(letters?.getAttribute("aria-hidden")).toBe("true");
    expect(part(root, "wordmark")).toBeNull();
  });

  it("shows the first character of a name with no letters in it as the monogram", async () => {
    const { root } = await render(<idg-brand-logo name={"\u202E"} variant="mark" />);
    expect(part(root, "monogram")?.querySelector(".letters")?.textContent).toBe("\uFFFD");
  });

  it("hides the monogram from assistive technology when it is decoration", async () => {
    const { root } = await render(
      <idg-brand-logo name="Harbour Lights" variant="mark" decorative />,
    );
    const monogram = part(root, "monogram");
    expect(monogram?.getAttribute("aria-hidden")).toBe("true");
    expect(monogram?.hasAttribute("role")).toBe(false);
    expect(monogram?.hasAttribute("aria-label")).toBe(false);
  });

  it("draws a logo given for the mark as the monogram when it is not sanitised", async () => {
    const { root } = await render(
      <idg-brand-logo logo={NOT_SANITISED[0]?.[1]} name="Acme" variant="mark" />,
    );
    expect(image(root)).toBeNull();
    expect(part(root, "monogram")?.querySelector(".letters")?.textContent).toBe("A");
  });

  it.each([
    ["no name", undefined],
    ["an empty name", ""],
    ["a name of white space", "  \n\t "],
  ])("draws nothing at all for %s and no logo", async (_label, name) => {
    for (const variant of ["logo", "mark"] as const) {
      const { root } = await render(<idg-brand-logo name={name} variant={variant} />);
      expect(shadow(root).querySelectorAll("img, [part]")).toHaveLength(0);
    }
  });

  it("draws nothing for a name that is not text", async () => {
    const { root } = await render(
      <idg-brand-logo name={{ toString: () => "x" } as unknown as string} />,
    );
    expect(shadow(root).querySelectorAll("img, [part]")).toHaveLength(0);
  });

  it("draws the name as text, whatever it holds", async () => {
    const { root } = await render(<idg-brand-logo name={"<img src=x onerror=alert(1)>"} />);
    expect(shadow(root).querySelectorAll("img")).toHaveLength(0);
    expect(part(root, "wordmark")?.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("neutralises bidirectional controls in the name and cuts a name past sixty characters", async () => {
    const { root } = await render(<idg-brand-logo name={`Acme‮evil ${"y".repeat(100)}`} />);
    const text = part(root, "wordmark")?.textContent ?? "";
    expect(text).not.toContain("‮");
    expect(Array.from(text)).toHaveLength(60);
    expect(text.endsWith("…")).toBe(true);
  });
});
