import type { FlatToken } from "./token-types.ts";

export interface AxisTokens {
  readonly axis: string;
  /** Every token any value of the axis sets, including its defaults. */
  readonly tokens: readonly FlatToken[];
}

/**
 * Axes stay independent only while each token belongs to exactly one of them. The first axis
 * to set a token owns it; any other axis setting it is reported with both files.
 */
export function findOwnershipProblems(axes: readonly AxisTokens[]): string[] {
  const owners = new Map<string, { readonly axis: string; readonly source: string }>();
  const reported = new Set<string>();
  const problems: string[] = [];
  for (const { axis, tokens } of axes) {
    for (const { path, source } of tokens) {
      const owner = owners.get(path);
      if (owner === undefined) {
        owners.set(path, { axis, source });
      } else if (owner.axis !== axis && !reported.has(`${axis} ${path}`)) {
        reported.add(`${axis} ${path}`);
        problems.push(
          `${source}: "${path}" is set by the ${axis} axis but the ${owner.axis} axis already owns it (${owner.source})`,
        );
      }
    }
  }
  return problems;
}
