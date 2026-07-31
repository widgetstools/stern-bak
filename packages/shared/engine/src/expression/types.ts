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
   * Optional: every row currently loaded into the grid. Populated by the
   * calculated-columns `valueGetter` (via `api.forEachNode`). Enables
   * column-wide aggregation semantics — e.g. `SUM([price])` reads this
   * array and returns the total across the whole dataset instead of just
   * the current row's price scalar. Falls back to scalar when omitted.
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
