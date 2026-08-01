/**
 * Static AST analysis: does an expression call any aggregate
 * (`aggregateColumnRefs`) function — SUM / AVG / MIN / MAX / MEDIAN /
 * STDEV / VARIANCE / COUNT / DISTINCT_COUNT — anywhere in its tree?
 *
 * Calculated-columns uses this to decide whether a data flush needs a
 * forced `refreshCells` over the virtual columns: only aggregate
 * expressions read the cross-row snapshot, so a grid whose virtual
 * columns are all row-local (`[price] * [qty]`) can skip the forced
 * repaint entirely — AG-Grid's own change detection already re-runs
 * row-local valueGetters for the rows a transaction touched.
 *
 * Function-name matching is case-insensitive, mirroring the
 * evaluator/compiler lookup (`functions.get(name.toUpperCase())`).
 */
import type { ExpressionNode } from './types';
import { getAllFunctions } from './functions';

let builtinAggregateNames: ReadonlySet<string> | null = null;

/** Upper-cased names of every built-in `aggregateColumnRefs` function. */
export function getAggregateFunctionNames(): ReadonlySet<string> {
  if (!builtinAggregateNames) {
    builtinAggregateNames = new Set(
      getAllFunctions()
        .filter((f) => f.aggregateColumnRefs === true)
        .map((f) => f.name.toUpperCase()),
    );
  }
  return builtinAggregateNames;
}

/**
 * Walk a parsed expression tree looking for a call to an aggregate
 * function. `node` is typed `unknown` so callers holding an AST through
 * the narrow `ExpressionEngineLike.parse(): unknown` interface can pass
 * it straight in. Unrecognized shapes are treated as non-aggregate.
 */
export function astUsesAggregateFunctions(
  node: unknown,
  aggregateNames: ReadonlySet<string> = getAggregateFunctionNames(),
): boolean {
  if (!node || typeof node !== 'object') return false;
  const n = node as ExpressionNode;
  switch (n.type) {
    case 'call':
      if (aggregateNames.has(n.name.toUpperCase())) return true;
      return n.args.some((a) => astUsesAggregateFunctions(a, aggregateNames));
    case 'binary':
      return (
        astUsesAggregateFunctions(n.left, aggregateNames)
        || astUsesAggregateFunctions(n.right, aggregateNames)
      );
    case 'unary':
      return astUsesAggregateFunctions(n.operand, aggregateNames);
    case 'ternary':
      return (
        astUsesAggregateFunctions(n.condition, aggregateNames)
        || astUsesAggregateFunctions(n.consequent, aggregateNames)
        || astUsesAggregateFunctions(n.alternate, aggregateNames)
      );
    case 'member':
      return astUsesAggregateFunctions(n.object, aggregateNames);
    case 'array':
      return n.elements.some((e) => astUsesAggregateFunctions(e, aggregateNames));
    default:
      return false;
  }
}
