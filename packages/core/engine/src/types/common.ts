import type { ExpressionNode, EvaluationContext } from '../expression/types';
import type { PerspectiveCompileResult } from '../expression/compiler';

// ─── Expression Engine ───────────────────────────────────────────────────────

export type CompiledExpression = (context: EvaluationContext) => unknown;

export interface ExpressionEngineInstance {
  parse(expression: string): ExpressionNode;
  evaluate(node: ExpressionNode, context: EvaluationContext): unknown;
  /** Parse and evaluate in one call — convenience method */
  parseAndEvaluate(expression: string, context: EvaluationContext): unknown;
  /** Compile once to a reusable closure — prefer on per-cell/per-row hot paths. */
  compile(expression: string): CompiledExpression;
  tryCompileToAgString(node: ExpressionNode): string | null;
  tryCompileToPerspectiveExpression(node: ExpressionNode): PerspectiveCompileResult;
  validate(expression: string): ValidationResult;
}

export type { ExpressionNode, EvaluationContext };

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ message: string; position: number; length: number }>;
}

// ─── CSS Style Properties — shared shape used by conditional-styling and
// the style adapters in core-v2. Keep in sync with the keys produced by
// `styleBridge.ts` and consumed by `applyCellStyle`. ─────────────────────

export interface CellStyleProperties {
  // Background
  backgroundColor?: string;
  // Text
  color?: string;
  fontWeight?: string;
  fontStyle?: string;
  fontSize?: string;
  fontFamily?: string;
  textAlign?: string;
  textDecoration?: string;
  // Borders (granular)
  borderTopColor?: string;
  borderTopWidth?: string;
  borderTopStyle?: string;
  borderRightColor?: string;
  borderRightWidth?: string;
  borderRightStyle?: string;
  borderBottomColor?: string;
  borderBottomWidth?: string;
  borderBottomStyle?: string;
  borderLeftColor?: string;
  borderLeftWidth?: string;
  borderLeftStyle?: string;
  // Padding
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
}

export interface ThemeAwareStyle {
  light: CellStyleProperties;
  dark: CellStyleProperties;
}
