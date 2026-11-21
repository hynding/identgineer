import type { Action, Expression, Role } from "./model";

type Value = string | number | boolean | null;

/** What a grant condition can read: `user.*` for the caller and `record.*` for the entry. */
export type ConditionData = Readonly<Record<string, Value>>;

class UnknownVariable extends Error {}

const evaluate = (expression: Expression, data: ConditionData): Value => {
  switch (expression.kind) {
    case "lit":
      return expression.value;
    case "var":
      if (!(expression.name in data)) throw new UnknownVariable(expression.name);
      return data[expression.name] ?? null;
    case "eq":
      return evaluate(expression.left, data) === evaluate(expression.right, data);
    case "ne":
      return evaluate(expression.left, data) !== evaluate(expression.right, data);
    case "and":
      return expression.args.every((arg) => evaluate(arg, data) === true);
    case "or":
      return expression.args.some((arg) => evaluate(arg, data) === true);
    case "not":
      return evaluate(expression.arg, data) === false;
  }
};

/** A condition holds only when it evaluates to true; an unknown variable denies, as camis does. */
const holds = (condition: Expression, data: ConditionData): boolean => {
  try {
    return evaluate(condition, data) === true;
  } catch (error) {
    if (error instanceof UnknownVariable) return false;
    throw error;
  }
};

/**
 * Whether `role` may take `action` on an entry of `contentType`, following camis' grant model as
 * the strapi-php target enforces it: some grant on the type lists the action, and either it has no
 * condition or its condition holds for `data`. A guest's data has no `user.id`.
 */
export const allows = (
  role: Role,
  contentType: string,
  action: Action,
  data: ConditionData = {},
): boolean =>
  role.grants.some(
    (grant) =>
      grant.contentType === contentType &&
      grant.actions.includes(action) &&
      (grant.condition === undefined || holds(grant.condition, data)),
  );
