import type {
  FlatToken,
  GradientStop,
  ResolvedToken,
  TokenType,
  TokenValue,
} from "./token-types.ts";
import { isGradientStopArray } from "./token-types.ts";

const WHOLE_ALIAS = /^\{([^{}]+)\}$/;
const INLINE_ALIAS = /\{([^{}]+)\}/g;

interface Resolution {
  readonly value: TokenValue;
  readonly type: TokenType | undefined;
}

/**
 * Resolves `{group.token}` references. Whole-string aliases take the target's value and type;
 * aliases embedded in a longer string are interpolated as text. Gradient stop colours may alias.
 */
export function resolveAliases(tokens: readonly FlatToken[]): ResolvedToken[] {
  const byPath = new Map(tokens.map((token) => [token.path, token]));
  const cache = new Map<string, ResolvedToken>();

  function lookup(
    targetPath: string,
    referrer: FlatToken,
    trail: readonly string[],
  ): ResolvedToken {
    const target = byPath.get(targetPath);
    if (target === undefined) {
      throw new Error(
        `${referrer.source}: token "${referrer.path}" references unknown alias "{${targetPath}}"`,
      );
    }
    return resolveToken(target, trail);
  }

  function resolveString(text: string, token: FlatToken, trail: readonly string[]): Resolution {
    const whole = WHOLE_ALIAS.exec(text);
    if (whole?.[1] !== undefined) {
      const target = lookup(whole[1], token, trail);
      return { value: target.value, type: target.type };
    }
    const value = text.replace(INLINE_ALIAS, (_match, targetPath: string) => {
      const target = lookup(targetPath, token, trail);
      if (typeof target.value !== "string" && typeof target.value !== "number") {
        throw new Error(
          `${token.source}: token "${token.path}" interpolates "{${targetPath}}", which is not a single value`,
        );
      }
      return String(target.value);
    });
    return { value, type: undefined };
  }

  function resolveGradient(
    stops: readonly GradientStop[],
    token: FlatToken,
    trail: readonly string[],
  ): readonly GradientStop[] {
    return stops.map((stop) => {
      const color = resolveString(stop.color, token, trail).value;
      if (typeof color !== "string") {
        throw new Error(
          `${token.source}: token "${token.path}" has a gradient stop that is not a colour`,
        );
      }
      return { color, position: stop.position };
    });
  }

  function resolveToken(token: FlatToken, trail: readonly string[]): ResolvedToken {
    const cached = cache.get(token.path);
    if (cached) return cached;

    const cycleStart = trail.indexOf(token.path);
    if (cycleStart !== -1) {
      const cycle = [...trail.slice(cycleStart), token.path].join(" -> ");
      throw new Error(`${token.source}: alias cycle ${cycle}`);
    }
    const nextTrail = [...trail, token.path];

    let resolution: Resolution;
    if (typeof token.value === "string") {
      resolution = resolveString(token.value, token, nextTrail);
    } else if (isGradientStopArray(token.value)) {
      resolution = { value: resolveGradient(token.value, token, nextTrail), type: undefined };
    } else {
      resolution = { value: token.value, type: undefined };
    }

    const type = token.type ?? resolution.type;
    if (type === undefined) {
      throw new Error(`${token.source}: token "${token.path}" has no $type and none to inherit`);
    }
    const resolved: ResolvedToken = { ...token, type, value: resolution.value };
    cache.set(token.path, resolved);
    return resolved;
  }

  return tokens.map((token) => resolveToken(token, []));
}
