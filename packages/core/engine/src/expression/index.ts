import type { ExpressionNode, EvaluationContext, ValidationResult, FunctionDefinition } from './types';
import type { ExpressionEngineInstance } from '../types/common';
import { tokenize } from './tokenizer';
import { parse } from './parser';
import { Evaluator } from './evaluator';
import {
  tryCompileToAgString,
  tryCompileToPerspectiveExpression,
  type PerspectiveCompileResult,
} from './compiler';
import { compileToFunction, type CompiledExpression } from './compileToFunction';
import { createFunctionRegistry, getAllFunctions } from './functions';
import { validateCallSites } from './validateCalls';

/**
 * Max distinct expression strings whose parsed AST we keep. Real grids have a
 * small, stable set of rule/column/alert expressions (tens, maybe low hundreds),
 * so this caps memory while keeping the steady-state hit rate at ~100%.
 */
const PARSE_CACHE_MAX = 1000;

export class ExpressionEngine implements ExpressionEngineInstance {
  private functions: Map<string, FunctionDefinition>;
  private evaluator: Evaluator;
  /**
   * Source string → parsed AST. The AST is treated as IMMUTABLE — the
   * evaluator and compiler only READ nodes — so the same instance is safely
   * shared across every call site. This turns the per-cell/per-tick
   * `parseAndEvaluate` hot path from a re-tokenize+re-parse into a Map lookup
   * (measured ~4–10x faster per expression; a 200-col × 40-row conditional-
   * styling frame drops from ~23ms to ~3ms). FIFO eviction — recency churn on
   * the hot path isn't worth the extra Map delete/set per hit.
   */
  private parseCache = new Map<string, ExpressionNode>();
  /** Source string → compiled closure. Same immutability + FIFO policy as `parseCache`. */
  private compileCache = new Map<string, CompiledExpression>();

  constructor() {
    this.functions = createFunctionRegistry();
    this.evaluator = new Evaluator(this.functions);
  }

  parse(expression: string): ExpressionNode {
    const cached = this.parseCache.get(expression);
    if (cached !== undefined) return cached;
    const node = parse(tokenize(expression));
    if (this.parseCache.size >= PARSE_CACHE_MAX) {
      // Drop the oldest entry (Map preserves insertion order).
      const oldest = this.parseCache.keys().next().value;
      if (oldest !== undefined) this.parseCache.delete(oldest);
    }
    this.parseCache.set(expression, node);
    return node;
  }

  evaluate(node: ExpressionNode, context: EvaluationContext): unknown {
    return this.evaluator.evaluate(node, context);
  }

  parseAndEvaluate(expression: string, context: EvaluationContext): unknown {
    const node = this.parse(expression);
    return this.evaluate(node, context);
  }

  /**
   * Compile an expression once into a reusable closure `(ctx) => value`. Prefer
   * this over `parseAndEvaluate` on per-cell / per-row hot paths: build the
   * closure when the rule/column is set up, then call it per evaluation. The
   * compiled fn is cached by source so repeated `compile(sameSource)` is free.
   *
   * `tryCompileToAgString` remains the FIRST choice where it applies (AG-Grid
   * evaluates a native string filter with zero JS); this closure is the
   * fallback for expressions AG can't express.
   */
  compile(expression: string): CompiledExpression {
    const cached = this.compileCache.get(expression);
    if (cached !== undefined) return cached;
    const fn = compileToFunction(this.parse(expression), this.functions);
    if (this.compileCache.size >= PARSE_CACHE_MAX) {
      const oldest = this.compileCache.keys().next().value;
      if (oldest !== undefined) this.compileCache.delete(oldest);
    }
    this.compileCache.set(expression, fn);
    return fn;
  }

  tryCompileToAgString(node: ExpressionNode): string | null {
    return tryCompileToAgString(node);
  }

  tryCompileToPerspectiveExpression(node: ExpressionNode): PerspectiveCompileResult {
    return tryCompileToPerspectiveExpression(node);
  }

  validate(expression: string): ValidationResult {
    try {
      const tokens = tokenize(expression);
      const node = parse(tokens);
      const callErrors = validateCallSites(node, this.functions);
      if (callErrors.length > 0) {
        return { valid: false, errors: callErrors };
      }
      return { valid: true, errors: [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const posMatch = message.match(/position (\d+)/);
      const position = posMatch ? parseInt(posMatch[1], 10) : 0;
      return {
        valid: false,
        errors: [{ message, position, length: 1 }],
      };
    }
  }

  registerFunction(fn: FunctionDefinition): void {
    this.functions.set(fn.name, fn);
  }

  getFunctions(): FunctionDefinition[] {
    return getAllFunctions();
  }

  getFunctionsByCategory(): Record<string, FunctionDefinition[]> {
    const result: Record<string, FunctionDefinition[]> = {};
    for (const fn of this.functions.values()) {
      if (!result[fn.category]) result[fn.category] = [];
      result[fn.category].push(fn);
    }
    return result;
  }
}

export type { ExpressionNode, EvaluationContext, ValidationResult, FunctionDefinition } from './types';
export { tokenize } from './tokenizer';
export { parse } from './parser';
export { Evaluator } from './evaluator';
export { tryCompileToAgString, tryCompileToPerspectiveExpression } from './compiler';
export type { PerspectiveCompileResult, PerspectiveExpressionType } from './compiler';
export { compileToFunction, type CompiledExpression } from './compileToFunction';
export { createFunctionRegistry, getAllFunctions } from './functions';
export { astUsesAggregateFunctions, getAggregateFunctionNames } from './usesAggregates';
export { migrateExpressionSyntax, migrateExpressionsInObject } from './migrate';
