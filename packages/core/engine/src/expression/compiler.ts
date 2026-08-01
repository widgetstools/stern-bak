import type { ExpressionNode } from './types';

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
