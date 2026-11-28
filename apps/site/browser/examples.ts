import type { Page } from "@playwright/test";

export interface ExampleReport {
  /** The tags of the example's own elements that draw nothing a visitor could see or use. */
  readonly empty: string[];
  /** What is painted outside the example's stage, as "tag.class past the left by 12px". */
  readonly escaping: string[];
  /** How much of the stage the example's elements fill, in CSS pixels. */
  readonly size: { readonly width: number; readonly height: number };
}

/**
 * Looks at the example of a component's page as a visitor sees it, through shadow roots: whether
 * each of its elements paints something (text, a control, or a box with a background or border),
 * and whether anything is painted outside the stage that holds it, once clipped by the boxes that
 * clip it (a table that scrolls inside its own box paints only what its box shows).
 */
export function inspectExample(page: Page): Promise<ExampleReport> {
  return page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>("figure.example-component .example-stage");
    if (!stage) throw new Error("the page has no example stage");
    const SKIPPED = new Set(["STYLE", "SCRIPT", "SLOT", "TEMPLATE", "LINK", "META"]);
    const CONTROLS = new Set([
      "BUTTON",
      "INPUT",
      "SELECT",
      "TEXTAREA",
      "A",
      "SVG",
      "IMG",
      "CANVAS",
      "PROGRESS",
      "HR",
    ]);

    const children = (element: Element): Element[] => [
      ...(element.shadowRoot ? [...element.shadowRoot.children] : []),
      ...element.children,
    ];
    const deep = (element: Element): Element[] => [element, ...children(element).flatMap(deep)];
    const shown = (element: Element) =>
      !SKIPPED.has(element.tagName) && element.checkVisibility({ visibilityProperty: true });
    const boxOf = (element: Element) => element.getBoundingClientRect();
    const parentOf = (element: Element): Element | null =>
      element.assignedSlot ??
      element.parentElement ??
      (element.parentNode instanceof ShadowRoot ? element.parentNode.host : null);

    /** The part of an element's box that its clipping ancestors leave in view. */
    const painted = (element: Element) => {
      const box = boxOf(element);
      let left = box.left;
      let right = box.right;
      let top = box.top;
      let bottom = box.bottom;
      for (let up = parentOf(element); up; up = parentOf(up)) {
        const style = getComputedStyle(up);
        const clipsX = style.overflowX !== "visible";
        const clipsY = style.overflowY !== "visible";
        if (!clipsX && !clipsY) continue;
        const clip = boxOf(up);
        if (clipsX) {
          left = Math.max(left, clip.left);
          right = Math.min(right, clip.right);
        }
        if (clipsY) {
          top = Math.max(top, clip.top);
          bottom = Math.min(bottom, clip.bottom);
        }
      }
      return { left, right, top, bottom };
    };

    const hasPaint = (element: Element) => {
      const style = getComputedStyle(element);
      const transparent = (colour: string) =>
        colour === "rgba(0, 0, 0, 0)" || colour === "transparent";
      return (
        !transparent(style.backgroundColor) ||
        style.backgroundImage !== "none" ||
        (Number.parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== "none")
      );
    };

    const showsSomething = (root: Element): boolean => {
      for (const element of deep(root)) {
        if (!shown(element)) continue;
        const box = boxOf(element);
        // A rule is a line: long, and as thin as one pixel.
        if (Math.max(box.width, box.height) < 16 || Math.min(box.width, box.height) <= 0) continue;
        if (CONTROLS.has(element.tagName.toUpperCase())) return true;
        if (element !== root && hasPaint(element)) return true;
        for (const node of element.childNodes) {
          if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "") {
            return true;
          }
        }
      }
      return false;
    };

    const frame = stage.querySelector<HTMLElement>(".preview-frame") ?? stage;
    const own = [...frame.children].filter(
      (element) => !element.matches(".needs-script, .preview-tag"),
    );
    // A closed dialog shows nothing until its button is pressed: the button is what is shown.
    const opener = stage.querySelector(":scope > .needs-script");
    const empty =
      opener && showsSomething(opener)
        ? []
        : own.filter((element) => !showsSomething(element)).map((e) => e.localName);

    const room = boxOf(stage);
    const escaping: string[] = [];
    for (const element of own.flatMap(deep)) {
      if (!shown(element)) continue;
      const box = painted(element);
      if (box.right - box.left <= 0 || box.bottom - box.top <= 0) continue;
      const past = [
        ["left", room.left - box.left],
        ["right", box.right - room.right],
        ["top", room.top - box.top],
        ["bottom", box.bottom - room.bottom],
      ] as const;
      for (const [side, by] of past) {
        if (by > 1) {
          const named = element.getAttribute("class")?.split(" ")[0];
          const name = named ? `${element.localName}.${named}` : element.localName;
          escaping.push(`${name} past the ${side} by ${String(Math.round(by))}px`);
        }
      }
    }
    const size = { width: Math.round(room.width), height: Math.round(room.height) };
    return { empty, escaping, size };
  });
}
