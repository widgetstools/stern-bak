// ─── Token Types ─────────────────────────────────────────────────────────────

export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  | 'IDENTIFIER'
  | 'COLUMN_REF'
  | 'OPERATOR'
  | 'COMPARISON'
  | 'LOGICAL'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'LBRACE'
  | 'RBRACE'
  | 'COMMA'
  | 'QUESTION'
  | 'COLON'
  | 'DOT'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

// ─── AST Node Types ──────────────────────────────────────────────────────────

export type ExpressionNode =
  | LiteralNode
  | ColumnRefNode
  | VariableNode
  | BinaryNode
  | UnaryNode
  | TernaryNode
  | CallNode
  | MemberNode
  | ArrayNode;

export interface LiteralNode {
  type: 'literal';
  value: number | string | boolean | null;
}

export interface ColumnRefNode {
  type: 'columnRef';
  columnId: string;
}

export interface VariableNode {
  type: 'variable';
  name: string;
}

export interface BinaryNode {
  type: 'binary';
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryNode {
  type: 'unary';
  operator: string;
  operand: ExpressionNode;
}

export interface TernaryNode {
  type: 'ternary';
  condition: ExpressionNode;
  consequent: ExpressionNode;
  alternate: ExpressionNode;
}

export interface CallNode {
  type: 'call';
  name: string;
  args: ExpressionNode[];
}

export interface MemberNode {
  type: 'member';
  object: ExpressionNode;
  property: string;
}

export interface ArrayNode {
  type: 'array';
  elements: ExpressionNode[];
}

// ─── Evaluation Context ──────────────────────────────────────────────────────

export interface EvaluationContext {
  x: unknown;
  value: unknown;
  data: Record<string, unknown>;
  columns: Record<string, unknown>;
  oldValue?: unknown;
  newValue?: unknown;
  /**
   * Optional: every row of the dataset. Supplied by whoever HOLDS them —
   * the calculated-columns module through `platform.data.scan` on the client
   * side, the query plane from its own row store on the server side. Enables
   * column-wide aggregation semantics: `SUM([price])` reads this array and
   * returns the total across the whole dataset instead of the current row's
   * price scalar. Falls back to scalar when omitted.
   */
  allRows?: ReadonlyArray<Record<string, unknown>>;
  /**
   * Optional companion to {@link allRows}: memoizes the per-column
   * value arrays that aggregate expansion (`SUM([price])` →
   * `allRows.map(getValueByPath)`) builds. Without it every RENDERED
   * CELL of an aggregate calculated column re-mapped the full row set
   * (20k-element array + 20k path reads per cell per refresh). The
   * supplier owns invalidation — clear it whenever `allRows` changes.
   */
  allRowsColumnCache?: Map<string, unknown[]>;
  /**
   * Optional second companion to {@link allRows}: memoizes the RESULT of a
   * whole-column fold, where {@link allRowsColumnCache} only memoizes its
   * input.
   *
   * The two are different costs and only one of them was ever paid down.
   * `SUM([price])` over 100k rows still ran `flat().map(toNum).reduce()` —
   * three full passes and two 100k-element allocations — once per row it was
   * evaluated for. Cheap enough when that meant the ~40 rows a viewport
   * paints; ruinous when it meant a 100-row block of a server-side query
   * (measured at 223 ms per block before this cache, 1.7 ms after).
   *
   * Only a call whose arguments are ALL direct column refs is memoized: those
   * are row-independent by construction, so one answer is every row's answer.
   * `[price] / SUM([price])` still varies per row — its `SUM` sub-call is
   * cached, its division is not. Same lifecycle as `allRowsColumnCache`: the
   * supplier clears both whenever `allRows` changes.
   */
  allRowsAggregateCache?: Map<string, unknown>;
}

// ─── Function Registry ───────────────────────────────────────────────────────

export interface FunctionDefinition {
  name: string;
  category: string;
  description: string;
  signature: string;
  minArgs: number;
  maxArgs: number;
  /**
   * When true, any direct `[columnRef]` argument is resolved to the entire
   * column — an array of every row's value pulled from `ctx.allRows` —
   * rather than the current row's scalar. Used by aggregation + stats
   * functions so `SUM([price])` / `AVG([yield])` / `MIN([spread])` act
   * as cross-row reducers, matching the Excel-style intuition.
   *
   * When `ctx.allRows` is undefined the flag is ignored — the function
   * behaves like a vararg reducer on the current row. That keeps
   * non-grid contexts (tests, server-side evaluation) working unchanged.
   */
  aggregateColumnRefs?: boolean;
  evaluate: (args: unknown[], ctx: EvaluationContext) => unknown;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationError {
  message: string;
  position: number;
  length: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
