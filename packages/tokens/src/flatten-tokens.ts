import type { FlatToken, TokenType, TokenValue } from "./token-types.ts";
import { isGradientStopArray, isNumberArray, isStringArray, isTokenType } from "./token-types.ts";
import { isRecord } from "./is-record.ts";

function describeLocation(file: string, path: readonly string[]): string {
  return `${file}: token "${path.join(".")}"`;
}

function assertValueMatchesType(
  value: unknown,
  type: TokenType | undefined,
  where: string,
): TokenValue {
  const wellFormed =
    typeof value === "string" ||
    typeof value === "number" ||
    (type === "fontFamily" && isStringArray(value)) ||
    (type === "cubicBezier" && isNumberArray(value)) ||
    (type === "gradient" && isGradientStopArray(value));
  if (!wellFormed) {
    throw new Error(`${where} has a $value that is not valid for $type "${type ?? "(none)"}"`);
  }
  return value;
}

function walk(
  file: string,
  node: unknown,
  path: readonly string[],
  inheritedType: TokenType | undefined,
  out: FlatToken[],
): void {
  const where = describeLocation(file, path);
  if (!isRecord(node)) {
    throw new Error(`${where} must be an object`);
  }
  const declaredType = node.$type;
  if (declaredType !== undefined && !isTokenType(declaredType)) {
    throw new Error(`${where} has unknown $type ${JSON.stringify(declaredType)}`);
  }
  const type = declaredType ?? inheritedType;
  const description = node.$description;

  if ("$value" in node) {
    out.push({
      path: path.join("."),
      type,
      value: assertValueMatchesType(node.$value, type, where),
      description: typeof description === "string" ? description : undefined,
      source: file,
    });
    return;
  }

  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    if (key.includes(".") || key.includes("{") || key.includes("}")) {
      throw new Error(`${where} has an invalid group or token name "${key}"`);
    }
    walk(file, child, [...path, key], type, out);
  }
}

/** Flattens a DTCG group into tokens, in source order, inheriting `$type` from ancestors. */
export function flattenTokens(file: string, json: unknown): FlatToken[] {
  const out: FlatToken[] = [];
  if (!isRecord(json)) {
    throw new Error(`${file}: the document root must be an object`);
  }
  for (const [key, child] of Object.entries(json)) {
    if (key.startsWith("$")) continue;
    walk(file, child, [key], undefined, out);
  }
  return out;
}
