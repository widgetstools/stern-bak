import type { ExpressionNode } from './types';
import { astUsesAggregateFunctions, getAggregateFunctionNames } from './usesAggregates';

/**
 * Attempts to compile an AST node into an AG-Grid compatible string expression.
 * AG-Grid string expressions support: x (cell value), comparison ops, arithmetic, &&, ||, !
 * Returns null if the expression is too complex for AG-Grid's evaluator.
 */
export function tryCompileToAgString(node: ExpressionNode): string | null {
  try {
    return compileNode(node);
  } catch {
    return null;
  }
}

function compileNode(node: ExpressionNode): string {
  switch (node.type) {
    case 'literal': {
      if (node.value === null) return 'null';
      if (typeof node.value === 'string') return `'${escapeString(node.value)}'`;
      if (typeof node.value === 'boolean') return node.value ? 'true' : 'false';
      return String(node.value);
    }

    case 'variable': {
      // AG-Grid expressions support: x (value), ctx, data, colDef, etc.
      if (node.name === 'x' || node.name === 'value') return 'x';
      if (node.name === 'data') return 'data';
      // Direct field access on data → compile as data.fieldName
      throw new UnsupportedError();
    }

    case 'columnRef':
      // Column refs require data access — not directly supported in simple string expressions
      throw new UnsupportedError();

    case 'binary': {
      const left = compileNode(node.left);
      const right = compileNode(node.right);

      switch (node.operator) {
        case '+': return `(${left} + ${right})`;
        case '-': return `(${left} - ${right})`;
        case '*': return `(${left} * ${right})`;
        case '/': return `(${left} / ${right})`;
        case '%': return `(${left} % ${right})`;
        case '>': return `${left} > ${right}`;
        case '<': return `${left} < ${right}`;
        case '>=': return `${left} >= ${right}`;
        case '<=': return `${left} <= ${right}`;
        case '==': return `${left} == ${right}`;
        case '!=': return `${left} != ${right}`;
        case 'AND': return `(${left}) && (${right})`;
        case 'OR': return `(${left}) || (${right})`;
        default:
          throw new UnsupportedError();
      }
    }

    case 'unary': {
      const operand = compileNode(node.operand);
      if (node.operator === 'NOT') return `!(${operand})`;
      if (node.operator === '-') return `-(${operand})`;
      throw new UnsupportedError();
    }

    case 'member': {
      const obj = compileNode(node.object);
      return `${obj}.${node.property}`;
    }

    // Function calls, ternaries, arrays, IN, BETWEEN — not supported in AG-Grid strings
    case 'call':
    case 'ternary':
    case 'array':
      throw new UnsupportedError();

    default:
      throw new UnsupportedError();
  }
}

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

class UnsupportedError extends Error {
  constructor() {
    super('Expression too complex for AG-Grid string expression');
  }
}

// ─── Perspective expression compiler ────────────────────────────────────────

export type PerspectiveExpressionType = 'float' | 'integer' | 'string' | 'boolean';

/**
 * Why a discriminated result rather than `string | null` like its AG sibling:
 * the calculated-column path has THREE tiers (compile to a Perspective
 * expression column → materialize the value into the row once on read → drop
 * the column as unsupported), and the user has to be told which one a column
 * landed in and why. A bare null cannot say "aggregate functions have no
 * server-side equivalent" versus "`.old`/`.new` only exist in the viewport".
 */
export type PerspectiveCompileResult =
  | { ok: true; expression: string; perspectiveType?: PerspectiveExpressionType }
  | { ok: false; reason: string };

/** The only functions with a Perspective equivalent we emit. Everything else is
 *  refused rather than approximated. */
const PERSPECTIVE_FUNCTIONS = new Set(['IF', 'IFS']);

class PerspectiveCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PerspectiveCompileError';
  }
}

/** `[px.old]` / `[px.new]` read the client-side diff overlay, which exists only
 *  for rows currently rendered. A server-side column has no viewport. */
function isViewportOnlyColumnRef(columnId: string): boolean {
  return columnId.endsWith('.old') || columnId.endsWith('.new');
}

/** Perspective quotes column refs and string literals the SAME way — with
 *  double quotes — which is the opposite convention from the AG-string path
 *  above, hence a second escape helper rather than a shared one. */
function escapeDoubleQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function compilePerspectiveNode(node: ExpressionNode): string {
  switch (node.type) {
    case 'literal': {
      if (node.value === null) return 'null';
      if (typeof node.value === 'string') return `"${escapeDoubleQuoted(node.value)}"`;
      if (typeof node.value === 'boolean') return node.value ? 'true' : 'false';
      return String(node.value);
    }

    case 'columnRef': {
      if (isViewportOnlyColumnRef(node.columnId)) {
        throw new PerspectiveCompileError(
          `Column reference [${node.columnId}] is viewport-only (.old/.new) and cannot compile to Perspective`,
        );
      }
      return `"${escapeDoubleQuoted(node.columnId)}"`;
    }

    case 'binary': {
      const left = compilePerspectiveNode(node.left);
      const right = compilePerspectiveNode(node.right);
      switch (node.operator) {
        case '+':
        case '-':
        case '*':
        case '/':
        case '>':
        case '<':
        case '>=':
        case '<=':
        case '==':
        case '!=':
          return `${left} ${node.operator} ${right}`;
        case 'AND':
          return `(${left} and ${right})`;
        case 'OR':
          return `(${left} or ${right})`;
        default:
          throw new PerspectiveCompileError(`Unsupported operator: ${node.operator}`);
      }
    }

    case 'unary': {
      const operand = compilePerspectiveNode(node.operand);
      if (node.operator === 'NOT') return compilePerspectiveNot(node.operand, operand);
      if (node.operator === '-') return `-${operand}`;
      throw new PerspectiveCompileError(`Unsupported unary operator: ${node.operator}`);
    }

    case 'call': {
      const name = node.name.toUpperCase();
      if (!PERSPECTIVE_FUNCTIONS.has(name)) {
        throw new PerspectiveCompileError(`Unsupported function: ${node.name}`);
      }
      const args = node.args.map((arg) => compilePerspectiveNode(arg));
      if (name === 'IF') {
        if (args.length !== 3) {
          throw new PerspectiveCompileError('IF requires exactly 3 arguments');
        }
        // Prefer if() over a ternary — nested `? :` fails for IFS.
        return `if(${args[0]}, ${args[1]}, ${args[2]})`;
      }
      return compilePerspectiveIfs(args);
    }

    case 'variable':
      throw new PerspectiveCompileError(`Unsupported variable: ${node.name}`);

    case 'member':
    case 'ternary':
    case 'array':
      throw new PerspectiveCompileError(`Unsupported expression construct: ${node.type}`);

    default:
      throw new PerspectiveCompileError('Unsupported expression node');
  }
}

/**
 * Negate WITHOUT `not()`.
 *
 * `not()` does not exist in 4.5.2 — MEASURED: every argument type, boolean
 * included, aborts with "Type Error - inputs do not resolve to a valid
 * expression". Worse, it only aborts when it is the WHOLE expression. Nested
 * inside `and`/`or`/`if` it validates clean as `boolean` and silently evaluates
 * wrong — `not(q > 10) and p > 95` answered false for every row, and
 * `if(not(q > 10), 1, 0)` answered 1 for every row. `validate_expressions`
 * reports no error for either, so the pre-flight check cannot catch this: it has
 * to never be emitted.
 *
 * `if(x, false, true)` is the negation that works, and it composes when nested
 * (verified). It needs a genuinely boolean operand, because a non-boolean
 * condition is accepted and reads truthy — `if("qty", false, true)` answered
 * false for every row of a non-zero column. So a NOT over anything not known to
 * be boolean is REFUSED rather than compiled into something that cannot fail
 * loudly. Refusing costs the caller a server-side column; compiling costs them a
 * wrong one.
 */
function compilePerspectiveNot(operandNode: ExpressionNode, operand: string): string {
  if (inferPerspectiveType(operandNode) !== 'boolean') {
    throw new PerspectiveCompileError(
      'NOT requires a boolean operand (a comparison, AND, OR or NOT) to compile to Perspective',
    );
  }
  return `if(${operand}, false, true)`;
}

/** Fold `IFS(c1, v1, c2, v2, [default])` right-to-left into nested `if(...)`.
 *  An even argument count means no default was given, and the innermost
 *  fallback becomes `null` rather than a guessed zero/empty string. */
function compilePerspectiveIfs(args: string[]): string {
  if (args.length < 2) {
    throw new PerspectiveCompileError('IFS requires at least 2 arguments');
  }

  const hasDefault = args.length % 2 === 1;
  const pairCount = Math.floor(args.length / 2);
  let result = hasDefault ? args[args.length - 1]! : 'null';

  for (let i = pairCount - 1; i >= 0; i--) {
    const cond = args[i * 2]!;
    const val = args[i * 2 + 1]!;
    result = `if(${cond}, ${val}, ${result})`;
  }

  return result;
}

function inferPerspectiveType(node: ExpressionNode): PerspectiveExpressionType | undefined {
  switch (node.type) {
    case 'literal':
      if (typeof node.value === 'boolean') return 'boolean';
      if (typeof node.value === 'string') return 'string';
      if (typeof node.value === 'number') {
        return Number.isInteger(node.value) ? 'integer' : 'float';
      }
      return undefined;
    case 'binary':
      if (node.operator === 'AND' || node.operator === 'OR') return 'boolean';
      if (['>', '<', '>=', '<=', '==', '!='].includes(node.operator)) return 'boolean';
      return 'float';
    case 'unary':
      if (node.operator === 'NOT') return 'boolean';
      return 'float';
    case 'call':
      return undefined;
    default:
      return undefined;
  }
}

/** Only walked on the refusal path, to name the offending function in the
 *  reason — `astUsesAggregateFunctions` answers whether, not which. */
function collectAggregateCallNames(node: ExpressionNode, out: Set<string>): void {
  switch (node.type) {
    case 'call':
      if (getAggregateFunctionNames().has(node.name.toUpperCase())) {
        out.add(node.name.toUpperCase());
      }
      for (const arg of node.args) collectAggregateCallNames(arg, out);
      return;
    case 'binary':
      collectAggregateCallNames(node.left, out);
      collectAggregateCallNames(node.right, out);
      return;
    case 'unary':
      collectAggregateCallNames(node.operand, out);
      return;
    case 'ternary':
      collectAggregateCallNames(node.condition, out);
      collectAggregateCallNames(node.consequent, out);
      collectAggregateCallNames(node.alternate, out);
      return;
    case 'member':
      collectAggregateCallNames(node.object, out);
      return;
    case 'array':
      for (const el of node.elements) collectAggregateCallNames(el, out);
      return;
    default:
      return;
  }
}

/**
 * Compile an AST node into a Perspective expression-column source string.
 *
 * The server-side twin of {@link tryCompileToAgString}: that one hands AG Grid
 * a native string filter, this one hands the worker's Perspective Table an
 * expression column. Under the Perspective row engine a row-local calculated
 * column MUST make this trip — a client `valueGetter` cannot be sorted,
 * filtered or grouped on server-side, so serving it that way is a silent
 * correctness gap rather than just a slow one.
 *
 * Takes a parsed node, not source, so callers reuse `ExpressionEngine.parse`'s
 * AST cache instead of re-tokenizing per column.
 *
 * NULL comparison semantics are the RULE AUTHOR's responsibility, not this
 * compiler's — a deliberate decision, recorded here so it is not mistaken for
 * an oversight. Perspective does not follow JS: `null > 95` evaluates TRUE, so
 * a threshold over a sparse column also matches its own empty cells. No
 * `is_null` guards are injected, because the AST carries no column types — a
 * guard would have to wrap every comparison, including the ones where matching
 * nulls is what the author meant — and because silently rewriting a predicate
 * would make the server-side column disagree with the identical expression
 * evaluated client-side. A documented difference beats an invisible rewrite.
 */
export function tryCompileToPerspectiveExpression(node: ExpressionNode): PerspectiveCompileResult {
  // Perspective's expression language is strictly row-local: it has no
  // cross-row aggregate of any kind. These would otherwise fall through the
  // generic unsupported-function branch with a message that reads like a
  // missing mapping rather than a structural gap.
  if (astUsesAggregateFunctions(node)) {
    const names = new Set<string>();
    collectAggregateCallNames(node, names);
    const listed = names.size > 0 ? `${[...names].join(', ')} ` : '';
    return {
      ok: false,
      reason: `Aggregate ${listed}cannot compile to Perspective — its expressions are row-local and have no cross-row aggregate`,
    };
  }

  try {
    return {
      ok: true,
      expression: compilePerspectiveNode(node),
      perspectiveType: inferPerspectiveType(node),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}
