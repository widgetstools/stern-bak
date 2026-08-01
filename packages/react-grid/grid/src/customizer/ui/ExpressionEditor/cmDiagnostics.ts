import { linter, type Diagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { ExpressionEngine } from '@wellsfargo-starui/core';

/**
 * Parse-error + deprecation diagnostics for the DSL.
 *
 * Same contract as the former Monaco `attachDiagnostics`: at most one `error`
 * from `ExpressionEngine.validate()` at the reported offset, plus one `info`
 * per `{col}` legacy column reference when `warnDeprecated` is on. CodeMirror's
 * linter debounces internally (`delay`), so the manual 150 ms timer the Monaco
 * version carried is gone, as is the marker-clearing disposer — diagnostics are
 * editor state and die with the editor.
 */

let _engine: ExpressionEngine | null = null;
function getEngine(): ExpressionEngine {
  return (_engine ??= new ExpressionEngine());
}

const DEPRECATED_COL_RE = /\{[A-Za-z_][A-Za-z0-9_]*\}/g;

export function expressionLinter(options: { warnDeprecated: boolean }): Extension {
  return linter(
    (view) => {
      const text = view.state.doc.toString();
      const diagnostics: Diagnostic[] = [];
      const max = text.length;
      const clamp = (n: number) => Math.max(0, Math.min(n, max));

      const result = getEngine().validate(text);
      if (!result.valid && result.errors.length > 0) {
        const err = result.errors[0];
        const from = clamp(err.position);
        const to = clamp(err.position + Math.max(1, err.length));
        diagnostics.push({
          from,
          to: to > from ? to : clamp(from + 1),
          severity: 'error',
          message: err.message,
        });
      }

      if (options.warnDeprecated) {
        DEPRECATED_COL_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = DEPRECATED_COL_RE.exec(text)) !== null) {
          const inner = m[0].slice(1, -1);
          diagnostics.push({
            from: clamp(m.index),
            to: clamp(m.index + m[0].length),
            severity: 'info',
            message: `\`{${inner}}\` is deprecated — use \`[${inner}]\` instead.`,
          });
        }
      }

      return diagnostics;
    },
    { delay: 150 },
  );
}
