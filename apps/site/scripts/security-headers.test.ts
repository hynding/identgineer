import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  contentSecurityPolicy,
  inlineStyles,
  securityHeaders,
  styleSource,
  styleAttributes,
  unexpectedStyleAttributes,
  withoutStyleAttributes,
} from "./security-headers";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("base64");
}

describe("the inline styles of a page", () => {
  it("are the exact text of each style element, in shadow roots too", () => {
    const html =
      '<head><style sty-id="a">.a{color:red}</style></head><template shadowrootmode="open"><style>:host{display:block}</style></template>';
    expect(inlineStyles(html)).toEqual([".a{color:red}", ":host{display:block}"]);
  });

  it("are none in a page without style elements", () => {
    expect(inlineStyles('<link rel="stylesheet" href="/a.css"><p>styled</p>')).toEqual([]);
  });
});

describe("a prerendered page's style attributes", () => {
  it("are removed from every element, whatever else it carries", () => {
    const html =
      '<div class="surface" popover="manual" style="--_offset: 8px;" title="a > b"><p style="color:red">x</p><br style="a:b"/></div>';
    expect(withoutStyleAttributes(html)).toBe(
      '<div class="surface" popover="manual" title="a > b"><p>x</p><br/></div>',
    );
  });

  it("leave text and other attributes that merely look like one", () => {
    const html =
      '<p data-style="x" title="a style=&quot;b&quot;">use style="--_offset: 8px;" here</p>';
    expect(withoutStyleAttributes(html)).toBe(html);
  });
});

describe("the style attributes of a page", () => {
  it("are listed with their text, in order", () => {
    const html = '<div style="--_offset: 8px;"><p class="a" style="color:red"></p></div>';
    expect(styleAttributes(html)).toEqual(["--_offset: 8px;", "color:red"]);
  });

  it("are all expected when each is the offset a component writes", () => {
    const html = '<i style="--_offset: 8px;"></i><i style="--_offset: 0px;"></i>';
    expect(unexpectedStyleAttributes(html)).toEqual([]);
  });

  it.each(["color:red", "--_offset: 8em;", "--_offset: 8px; color:red", "--other: 8px;"])(
    "name %s as unexpected, so that stripping it is not silent",
    (text) => {
      expect(unexpectedStyleAttributes(`<i style="${text}"></i>`)).toEqual([text]);
    },
  );
});

describe("a style source", () => {
  it("is the quoted SHA-256 of the style's UTF-8 text", () => {
    const css = ':host{content:"→"}';
    expect(styleSource(css)).toBe(`'sha256-${sha256(css)}'`);
  });
});

describe("the content security policy", () => {
  const policy = contentSecurityPolicy([":host{display:block}", ".a{}", ":host{display:block}"]);
  const directives = new Map(
    policy.split("; ").map((directive) => {
      const [name = "", ...values] = directive.split(" ");
      return [name, values] as const;
    }),
  );

  it("denies everything it does not name", () => {
    expect(directives.get("default-src")).toEqual(["'none'"]);
    expect(directives.get("object-src")).toBeUndefined();
  });

  it("runs only the site's own scripts, under Trusted Types, with no policy of its own", () => {
    expect(directives.get("script-src")).toEqual(["'self'"]);
    expect(directives.get("require-trusted-types-for")).toEqual(["'script'"]);
    expect(directives.get("trusted-types")).toEqual(["'none'"]);
  });

  it("allows the site's stylesheets and each inline style by its hash, once, in a stable order", () => {
    const hashes = [styleSource(".a{}"), styleSource(":host{display:block}")].sort();
    expect(directives.get("style-src")).toEqual(["'self'", ...hashes]);
  });

  it("never allows inline code or another origin", () => {
    expect(policy).not.toMatch(/unsafe-|https?:|\*|data:/);
  });

  it("allows only same-origin images and no plugins, frames, base or form submission", () => {
    expect(directives.get("img-src")).toEqual(["'self'"]);
    expect(directives.get("base-uri")).toEqual(["'none'"]);
    expect(directives.get("form-action")).toEqual(["'none'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
  });
});

describe("the security headers", () => {
  it("carry the policy and the other headers a deployment must send with every page", () => {
    expect(securityHeaders("default-src 'none'")).toEqual({
      "Content-Security-Policy": "default-src 'none'",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
  });
});
