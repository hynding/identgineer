import type { Page } from "@playwright/test";

/**
 * Makes the page's styles, the shadow roots' included, what an engine without `calc-size()` reads:
 * every declaration that uses it is dropped, and every `@supports not (… calc-size(…) …)` block
 * applies, its rules put where the block was. Returns how many changes it made.
 */
export function withoutCalcSize(page: Page): Promise<number> {
  return page.evaluate(() => {
    let changed = 0;
    const visit = (rules: CSSRuleList, owner: CSSStyleSheet | CSSGroupingRule) => {
      for (let index = rules.length - 1; index >= 0; index -= 1) {
        const rule = rules[index];
        if (
          rule instanceof CSSSupportsRule &&
          rule.conditionText.includes("calc-size(") &&
          /^\s*not\b/.test(rule.conditionText)
        ) {
          const inner = [...rule.cssRules].map((each) => each.cssText);
          owner.deleteRule(index);
          inner.reverse().forEach((text) => owner.insertRule(text, index));
          changed += 1;
          continue;
        }
        if (rule instanceof CSSStyleRule) {
          for (const property of [...rule.style]) {
            if (rule.style.getPropertyValue(property).includes("calc-size(")) {
              rule.style.removeProperty(property);
              changed += 1;
            }
          }
        }
        if (rule instanceof CSSGroupingRule) visit(rule.cssRules, rule);
      }
    };
    const sheets = new Set<CSSStyleSheet>([
      ...document.styleSheets,
      ...document.adoptedStyleSheets,
    ]);
    const collect = (root: Document | ShadowRoot) => {
      for (const element of root.querySelectorAll("*")) {
        if (!element.shadowRoot) continue;
        for (const sheet of element.shadowRoot.adoptedStyleSheets) sheets.add(sheet);
        for (const sheet of element.shadowRoot.styleSheets) sheets.add(sheet);
        collect(element.shadowRoot);
      }
    };
    collect(document);
    for (const sheet of sheets) visit(sheet.cssRules, sheet);
    return changed;
  });
}
