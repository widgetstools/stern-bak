/**
 * Shared, pure operator/resolution semantics for expression evaluation.
 *
 * BOTH the tree-walking `Evaluator` and the closure `compile()` import these,
 * so the interpreted and compiled paths can NEVER diverge in behaviour — there
 * is exactly one definition of truthiness, each operator, variable/column
 * resolution, and the function-call contract. Parity is enforced structurally,
 * not by duplicated switch statements.
 *
 * Note: AND/OR short-circuiting lives in the caller (it needs the un-evaluated
 * operands), so `applyBinary` deliberately does NOT handle them.
 */
import { getValueByPath } from '@wellsfargo-starui/types';
import type { EvaluationContext, ExpressionNode, FunctionDefinition } from './types';

export function isTruthy(val: unknown): boolean {
  if (val === null || val === undefined || val === false || val === 0 || val === '') return false;
  return true;
}

export function applyUnary(op: string, val: unknown): unknown {
  switch (op) {
    case 'NOT':
      return !isTruthy(val);
    case '-':
      return -(val as number);
    default:
      throw new Error(`Unknown unary operator: ${op}`);
  }
}

/** Non-short-circuit binary operators. AND/OR are handled by the caller. */
export function applyBinary(op: string, left: unknown, right: unknown): unknown {
  switch (op) {
    case '+':
      if (typeof left === 'string' || typeof right === 'string') return `${left}${right}`;
      return (left as number) + (right as number);
    case '-':
      return (left as number) - (right as number);
    case '*':
      return (left as number) * (right as number);
    case '/':
      if ((right as number) === 0) return null;
      return (left as number) / (right as number);
    case '%':
      return (left as number) % (right as number);
    case '>':
      return (left as number) > (right as number);
    case '<':
      return (left as number) < (right as number);
    case '>=':
      return (left as number) >= (right as number);
    case '<=':
      return (left as number) <= (right as number);
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case 'IN':
      return Array.isArray(right) && right.includes(left);
    case 'BETWEEN':
      if (!Array.isArray(right) || right.length !== 2) return false;
      return (left as number) >= (right[0] as number) && (left as number) <= (right[1] as number);
    default:
      throw new Error(`Unknown binary operator: ${op}`);
  }
}

export function resolveVariable(name: string, ctx: EvaluationContext): unknown {
  switch (name) {
    case 'x':
    case 'value':
      return ctx.value;
    case 'data':
    case 'row':
      return ctx.data;
    case 'oldValue':
      return ctx.oldValue;
    case 'newValue':
      return ctx.newValue;
    default:
      if (name in ctx.data) return ctx.data[name];
      if (name in ctx.columns) return ctx.columns[name];
      return undefined;
  }
}

export function resolveColumnRef(columnId: string, ctx: EvaluationContext): unknown {
  // Dot-walk so `[ratings.sp]` resolves via row.ratings.sp; flat literal keys
  // still win first inside getValueByPath, preserving feeds that encode dots.
  const fromColumns = getValueByPath(ctx.columns, columnId);
  if (fromColumns !== undefined && fromColumns !== null) return fromColumns;
  const fromData = getValueByPath(ctx.data, columnId);
  return fromData ?? null;
}

/**
 * Build the argument values for a function call. `evalArg` evaluates a normal
 * (non-aggregate) argument node — the interpreter passes its tree-walk, the
 * compiler passes the arg's pre-compiled closure. The aggregate-columnRef
 * special case (`SUM([price])` over `ctx.allRows`) is identical for both.
 */
export function buildCallArgs(
  fn: FunctionDefinition,
  argNodes: readonly ExpressionNode[],
  ctx: EvaluationContext,
  evalArg: (node: ExpressionNode, index: number) => unknown,
): unknown[] {
  if (fn.aggregateColumnRefs && ctx.allRows) {
    return argNodes.map((arg, i) => {
      if (arg.type === 'columnRef') {
        const cached = ctx.allRowsColumnCache?.get(arg.columnId);
        if (cached) return cached;
        const values = ctx.allRows!.map((row) => getValueByPath(row, arg.columnId) ?? null);
        ctx.allRowsColumnCache?.set(arg.columnId, values);
        return values;
      }
      return evalArg(arg, i);
    });
  }
  return argNodes.map((arg, i) => evalArg(arg, i));
}

/** Arg-count check + dispatch. Shared so both paths enforce the same contract. */
export function invokeFunction(
  fn: FunctionDefinition,
  name: string,
  args: unknown[],
  ctx: EvaluationContext,
): unknown {
  if (args.length < fn.minArgs || args.length > fn.maxArgs) {
    throw new Error(`${name} expects ${fn.minArgs}-${fn.maxArgs} arguments, got ${args.length}`);
  }
  return fn.evaluate(args, ctx);
}
