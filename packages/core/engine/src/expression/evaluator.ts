import type { ExpressionNode, EvaluationContext, FunctionDefinition } from './types';
import {
  applyBinary,
  applyUnary,
  evaluateCall,
  isTruthy,
  resolveColumnRef,
  resolveVariable,
} from './evalOps';

export class Evaluator {
  private functions: Map<string, FunctionDefinition>;

  constructor(functions: Map<string, FunctionDefinition>) {
    this.functions = functions;
  }

  evaluate(node: ExpressionNode, ctx: EvaluationContext): unknown {
    switch (node.type) {
      case 'literal':
        return node.value;

      case 'variable':
        return resolveVariable(node.name, ctx);

      case 'columnRef':
        return resolveColumnRef(node.columnId, ctx);

      case 'member': {
        const obj = this.evaluate(node.object, ctx);
        if (obj == null) return null;
        return (obj as Record<string, unknown>)[node.property];
      }

      case 'unary':
        return applyUnary(node.operator, this.evaluate(node.operand, ctx));

      case 'binary':
        return this.evaluateBinary(node.operator, node.left, node.right, ctx);

      case 'ternary': {
        const cond = this.evaluate(node.condition, ctx);
        return isTruthy(cond)
          ? this.evaluate(node.consequent, ctx)
          : this.evaluate(node.alternate, ctx);
      }

      case 'call':
        return this.evaluateCall(node.name, node.args, ctx);

      case 'array':
        return node.elements.map((el) => this.evaluate(el, ctx));

      default:
        throw new Error(`Unknown node type: ${(node as { type: string }).type}`);
    }
  }

  private evaluateBinary(
    op: string,
    leftNode: ExpressionNode,
    rightNode: ExpressionNode,
    ctx: EvaluationContext,
  ): unknown {
    // Short-circuit AND/OR need the un-evaluated operands.
    if (op === 'AND') {
      const left = this.evaluate(leftNode, ctx);
      return isTruthy(left) ? this.evaluate(rightNode, ctx) : left;
    }
    if (op === 'OR') {
      const left = this.evaluate(leftNode, ctx);
      return isTruthy(left) ? left : this.evaluate(rightNode, ctx);
    }
    return applyBinary(op, this.evaluate(leftNode, ctx), this.evaluate(rightNode, ctx));
  }

  private evaluateCall(name: string, argNodes: ExpressionNode[], ctx: EvaluationContext): unknown {
    const fn = this.functions.get(name.toUpperCase());
    if (!fn) throw new Error(`Unknown function: ${name}`);
    return evaluateCall(fn, name, argNodes, ctx, (arg) => this.evaluate(arg, ctx));
  }
}
