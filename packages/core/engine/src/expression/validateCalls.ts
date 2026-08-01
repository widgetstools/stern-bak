import type { ExpressionNode, FunctionDefinition, ValidationError } from './types';

function walkCalls(node: ExpressionNode, visit: (call: Extract<ExpressionNode, { type: 'call' }>) => void): void {
  switch (node.type) {
    case 'call':
      visit(node);
      for (const arg of node.args) walkCalls(arg, visit);
      break;
    case 'binary':
      walkCalls(node.left, visit);
      walkCalls(node.right, visit);
      break;
    case 'unary':
      walkCalls(node.operand, visit);
      break;
    case 'ternary':
      walkCalls(node.condition, visit);
      walkCalls(node.consequent, visit);
      walkCalls(node.alternate, visit);
      break;
    case 'member':
      walkCalls(node.object, visit);
      break;
    case 'array':
      for (const el of node.elements) walkCalls(el, visit);
      break;
    case 'literal':
    case 'columnRef':
    case 'variable':
      break;
    default:
      break;
  }
}

/** Resolve unknown functions and arity mismatches before runtime hot paths. */
export function validateCallSites(
  node: ExpressionNode,
  functions: Map<string, FunctionDefinition>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  walkCalls(node, (call) => {
    const name = call.name.toUpperCase();
    const fn = functions.get(name);
    if (!fn) {
      errors.push({
        message: `Unknown function: ${call.name}`,
        position: 0,
        length: call.name.length,
      });
      return;
    }
    const count = call.args.length;
    if (count < fn.minArgs || count > fn.maxArgs) {
      errors.push({
        message: `${call.name} expects ${fn.minArgs}-${fn.maxArgs} arguments, got ${count}`,
        position: 0,
        length: call.name.length,
      });
    }
  });
  return errors;
}
