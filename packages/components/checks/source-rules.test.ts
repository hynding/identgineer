import { describe, expect, it } from "vitest";
import { findSourceViolations } from "./source-rules";

const rules = (source: string) => findSourceViolations(source).map((violation) => violation.rule);

describe("findSourceViolations", () => {
  it("accepts ordinary component code", () => {
    const source = `
      import { Component, h } from "@stencil/core";
      @Component({ tag: "idg-x", shadow: true })
      export class X { render() { return <button onClick={this.handle} class="control">{this.label}</button>; } }
    `;
    expect(findSourceViolations(source)).toEqual([]);
  });

  it.each([
    ["innerHTML", "host.innerHTML = value;", "innerHTML"],
    ["outerHTML", "el.outerHTML = value;", "outerHTML"],
    ["insertAdjacentHTML", 'el.insertAdjacentHTML("beforeend", html);', "insertAdjacentHTML"],
    ["document.write", "document.write(html);", "document.write"],
    ["document.writeln", "document.writeln(html);", "document.write"],
    ["a Stencil innerHTML attribute", "<div innerHTML={html} />", "innerHTML"],
    ["srcdoc", "<iframe srcdoc={html} />", "srcdoc"],
    ["eval", "eval(code);", "eval"],
    ["window.eval", "window.eval(code);", "eval"],
    ["new Function", 'new Function("return 1");', "Function constructor"],
    ["Function()", 'Function("return 1")();', "Function constructor"],
    ["setTimeout with a string", 'setTimeout("go()", 10);', "string timer"],
    ["setInterval with a template", "setInterval(`go()`, 10);", "string timer"],
    ["a string onclick", '<button onClick="go()" />', "string event handler"],
    ["a lowercase string onclick", "<button onclick='go()' />", "string event handler"],
    ["a template event handler", "<button onClick={`go()`} />", "string event handler"],
    ["setAttribute onclick", 'el.setAttribute("onclick", code);', "string event handler"],
    ["a string style", '<div style="color: red" />', "inline style string"],
    ["a template style", "<div style={`width: ${width}`} />", "inline style string"],
    ["setAttribute style", 'el.setAttribute("style", css);', "inline style string"],
    ["cssText", "el.style.cssText = css;", "inline style string"],
    ["a javascript url", 'const u = "javascript:alert(1)";', "javascript url"],
  ])("refuses %s", (_name, source, rule) => {
    expect(rules(source)).toContain(rule);
  });

  it("does not flag the words in comments", () => {
    expect(
      findSourceViolations("// never use innerHTML or eval\n/* document.write */ const a = 1;"),
    ).toEqual([]);
  });

  it("does not flag identifiers that merely contain a banned word", () => {
    expect(findSourceViolations("const retrieval = evaluate(); const medieval = 1;")).toEqual([]);
  });

  it("reports the line of each violation", () => {
    const violations = findSourceViolations(
      "const a = 1;\nel.innerHTML = x;\nconst b = 2;\neval(c);",
    );
    expect(violations.map((violation) => violation.line)).toEqual([2, 4]);
  });
});
