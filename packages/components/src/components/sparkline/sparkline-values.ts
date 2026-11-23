/** The most values read from one `values`; more are thinned to this many, keeping the first, last, lowest and highest. */
export const MAX_INPUT_VALUES = 10_000;

/** Text longer than this is read as far as here: use the property for a series that is longer. */
export const MAX_INPUT_TEXT = 200_000;

export type Trend = "rising" | "falling" | "steady";

export interface SparklineSummary {
  readonly count: number;
  readonly first: number;
  readonly last: number;
  readonly lowest: number;
  readonly highest: number;
  readonly trend: Trend;
}

// `\d+(?:\.\d*)?` and not `\d+\.?\d*`: the second can split a run of digits in as many ways as it has
// digits, which a long token that fails at its last character turns into quadratic time.
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/** No number anyone means to draw has more characters than this. */
const MAX_TOKEN_LENGTH = 64;

function finiteNumbers(values: readonly unknown[]): number[] {
  const kept: number[] = [];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) kept.push(value);
  }
  return kept;
}

function fromText(text: string): number[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    // Cut JSON is broken JSON, and guessing where it ends would draw a series that was never sent.
    if (trimmed.length > MAX_INPUT_TEXT) return [];
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return Array.isArray(parsed) ? finiteNumbers(parsed) : [];
    } catch {
      return [];
    }
  }
  let list = trimmed;
  if (list.length > MAX_INPUT_TEXT) {
    // The last entry would be cut in the middle of its digits.
    list = list.slice(0, list.lastIndexOf(",", MAX_INPUT_TEXT));
  }
  return finiteNumbers(
    list.split(",").map((entry) => {
      const token = entry.trim();
      return token.length <= MAX_TOKEN_LENGTH && DECIMAL.test(token) ? Number(token) : Number.NaN;
    }),
  );
}

/**
 * The numbers in `values`, which arrives as an array from script or as text from an attribute
 * (a JSON array, or numbers separated by commas). Anything that is not a finite number is left out
 * and never read as zero, since a gap drawn as a drop to zero is a false trend.
 */
export function parseValues(input: unknown): number[] {
  let numbers: number[];
  if (Array.isArray(input)) numbers = finiteNumbers(input);
  else if (typeof input === "string") numbers = fromText(input);
  else numbers = [];
  return downsample(numbers, MAX_INPUT_VALUES);
}

/** What the series says in words: where it began and ended, its range and which way it went. */
export function summarise(values: readonly number[]): SparklineSummary | undefined {
  const first = values[0];
  const last = values[values.length - 1];
  if (first === undefined || last === undefined) return undefined;
  let lowest = first;
  let highest = first;
  for (const value of values) {
    if (value < lowest) lowest = value;
    if (value > highest) highest = value;
  }
  let trend: Trend = "steady";
  if (last > first) trend = "rising";
  else if (last < first) trend = "falling";
  return { count: values.length, first, last, lowest, highest, trend };
}

/**
 * No more than `limit` values to draw, in order, with the first, the last, the lowest and the
 * highest kept (when there is room) so thinning never flattens a spike or a dip, and the rest
 * evenly spread. One pass over the values, however many there are.
 */
export function downsample(values: readonly number[], limit: number): number[] {
  if (values.length <= limit) return [...values];
  if (limit <= 1) return values.slice(-1);
  const lastIndex = values.length - 1;
  const chosen = new Set<number>([0, lastIndex]);
  if (limit >= 4) {
    let lowestAt = 0;
    let highestAt = 0;
    values.forEach((value, index) => {
      if (value < (values[lowestAt] ?? value)) lowestAt = index;
      if (value > (values[highestAt] ?? value)) highestAt = index;
    });
    chosen.add(lowestAt);
    chosen.add(highestAt);
  }
  const spare = limit - chosen.size;
  for (let slot = 1; slot <= spare; slot += 1) {
    chosen.add(Math.round((slot * lastIndex) / (spare + 1)));
  }
  return [...chosen]
    .sort((left, right) => left - right)
    .slice(0, limit)
    .map((index) => values[index] ?? 0);
}
