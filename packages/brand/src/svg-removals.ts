import {
  MAX_REPORTED_REMOVALS,
  type SvgLogoRemoval,
  type SvgLogoRemovalReason,
} from "./svg-logo-result.ts";

export interface TextPosition {
  readonly line: number;
  readonly column: number;
}

/** Turns offsets into lines and columns, indexing the line starts once, on first use. */
export class TextLocator {
  private lineStarts: number[] | undefined;
  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  locate(offset: number): TextPosition {
    this.lineStarts ??= this.indexLines();
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((this.lineStarts[middle] ?? 0) <= offset) low = middle;
      else high = middle - 1;
    }
    return { line: low + 1, column: offset - (this.lineStarts[low] ?? 0) + 1 };
  }

  private indexLines(): number[] {
    const starts = [0];
    for (
      let index = this.text.indexOf("\n");
      index !== -1;
      index = this.text.indexOf("\n", index + 1)
    ) {
      starts.push(index + 1);
    }
    return starts;
  }
}

export interface RemovalNames {
  readonly element: string;
  readonly attribute?: string;
  readonly property?: string;
}

/** Collects what was dropped, keeping the first `MAX_REPORTED_REMOVALS` and counting the rest. */
export class Removals {
  readonly list: SvgLogoRemoval[] = [];
  count = 0;
  private readonly locator: TextLocator;

  constructor(locator: TextLocator) {
    this.locator = locator;
  }

  add(names: RemovalNames, reason: SvgLogoRemovalReason, offset: number): void {
    this.count += 1;
    if (this.list.length >= MAX_REPORTED_REMOVALS) return;
    this.list.push({ ...names, reason, ...this.locator.locate(offset) });
  }
}
