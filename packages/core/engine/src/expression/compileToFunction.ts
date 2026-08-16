/**
 * Compile a parsed expression AST into a closure `(ctx) => value`.
 *
 * The tree-walking `Evaluator` re-dispatches on `node.type` and re-reads node
 * fields on EVERY evaluation. Compiling walks the tree ONCE: each node becomes
 * a closure that captures its already-resolved structure (operator, child
 * closures, the resolved function), so per-evaluation work is a chain of direct
 * calls with no `switch` dispatch. All actual semantics come from the shared
 * `evalOps` module, so a compiled expression is behaviourally identical to the
 * interpreted one (enforced by `compileToFunction.test.ts`).
 */
import type { EvaluationContext, ExpressionNode, FunctionDefinition } from './types';
import {
  applyBinary,
  applyUnary,
  evaluateCall,
  isTruthy,
  resolveColumnRef,
  resolveVariable,
} from './evalOps';

export type CompiledExpression = (ctx: EvaluationContext) => unknown;

export function compileToFunction(
  node: ExpressionNode,
  functions: Map<string, FunctionDefinition>,
): CompiledExpression {
  switch (node.type) {
    case 'literal': {
      const v = node.value;
      return () => v;
    }

    case 'variable': {
      const name = node.name;
      return (ctx) => resolveVariable(name, ctx);
    }

    case 'columnRef': {
      const id = node.columnId;
      return (ctx) => resolveColumnRef(id, ctx);
    }

    case 'member': {
      const objFn = compileToFunction(node.object, functions);
      const prop = node.property;
      return (ctx) => {
        const obj = objFn(ctx);
        if (obj == null) return null;
        return (obj as Record<string, unknown>)[prop];
      };
    }

    case 'unary': {
      const op = node.operator;
      const operandFn = compileToFunction(node.operand, functions);
      return (ctx) => applyUnary(op, operandFn(ctx));
    }

    case 'binary': {
      const op = node.operator;
      const leftFn = compileToFunction(node.left, functions);
      const rightFn = compileToFunction(node.right, functions);
      // Short-circuit AND/OR keep both operands lazy.
      if (op === 'AND') {
        return (ctx) => {
          const left = leftFn(ctx);
          return isTruthy(left) ? rightFn(ctx) : left;
        };
      }
      if (op === 'OR') {
        return (ctx) => {
          const left = leftFn(ctx);
          return isTruthy(left) ? left : rightFn(ctx);
        };
      }
      return (ctx) => applyBinary(op, leftFn(ctx), rightFn(ctx));
    }

    case 'ternary': {
      const condFn = compileToFunction(node.condition, functions);
      const consFn = compileToFunction(node.consequent, functions);
      const altFn = compileToFunction(node.alternate, functions);
      return (ctx) => (isTruthy(condFn(ctx)) ? consFn(ctx) : altFn(ctx));
    }

    case 'array': {
      const elFns = node.elements.map((el) => compileToFunction(el, functions));
      return (ctx) => elFns.map((fn) => fn(ctx));
    }

    case 'call': {
      const name = node.name;
      const fn = functions.get(name.toUpperCase());
      if (!fn) {
        // Defer to call time so an unknown function in a NON-taken branch
        // doesn't throw — matching the interpreter, which only throws when
        // the call node is actually reached.
        return () => {
          throw new Error(`Unknown function: ${name}`);
        };
      }
      const argNodes = node.args;
      const argFns = argNodes.map((arg) => compileToFunction(arg, functions));
      return (ctx) => evaluateCall(fn, name, argNodes, ctx, (_arg, i) => argFns[i](ctx));
    }

    default:
      throw new Error(`Unknown node type: ${(node as { type: string }).type}`);
  }
}
