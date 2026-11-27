import type { Page } from "@playwright/test";

/**
 * Makes the page's styles, the shadow roots' included, what an engine without container style
 * queries reads: every `@container … style(…)` block is dropped. Returns how many it dropped.
 */
export function withoutStyleQueries(page: Page): Promise<number> {
  return page.evaluate(() => {
    let removed = 0;
    const visit = (rules: CSSRuleList, owner: CSSStyleSheet | CSSGroupingRule) => {
      for (let index = rules.length - 1; index >= 0; index -= 1) {
        const rule = rules[index];
        if (rule instanceof CSSContainerRule && rule.conditionText.includes("style(")) {
          owner.deleteRule(index);
          removed += 1;
        } else if (rule instanceof CSSGroupingRule) {
          visit(rule.cssRules, rule);
        }
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
    return removed;
  });
}
