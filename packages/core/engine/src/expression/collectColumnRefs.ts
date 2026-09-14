import type { ExpressionNode } from './types';

/**
 * Every column an expression reads (`[ccy]`, `[notional]`, …), in first-seen
 * order, without duplicates. Used by installers of row predicates — the
 * toolbar-date row exclusion — to declare which columns their external
 * filter depends on, so the rendered-row apply path can attribute it
 * (refactor plan B2).
 */
export function collectColumnRefs(node: ExpressionNode): string[] {
  const out = new Set<string>();
  walk(node, out);
  return [...out];
}

function walk(node: ExpressionNode, out: Set<string>): void {
  switch (node.type) {
    case 'columnRef':
      out.add(node.columnId);
      break;
    case 'call':
      for (const arg of node.args) walk(arg, out);
      break;
    case 'binary':
      walk(node.left, out);
      walk(node.right, out);
      break;
    case 'unary':
      walk(node.operand, out);
      break;
    case 'ternary':
      walk(node.condition, out);
      walk(node.consequent, out);
      walk(node.alternate, out);
      break;
    case 'member':
      walk(node.object, out);
      break;
    case 'array':
      for (const el of node.elements) walk(el, out);
      break;
    default:
      break;
  }
}
