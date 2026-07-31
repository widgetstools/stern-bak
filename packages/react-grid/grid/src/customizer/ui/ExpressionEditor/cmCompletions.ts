import {
  autocompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import {
  OPERATORS_AND_KEYWORDS,
  defaultFunctionsProvider,
  findUnclosedBracket,
  type ColumnsFn,
  type FunctionsFn,
} from './completionCatalog';

/**
 * CodeMirror autocomplete for the ExpressionEngine DSL.
 *
 * Unlike Monaco — whose completion providers are LANGUAGE-GLOBAL, forcing a
 * module-level registry of every live editor's providers plus a dedupe pass —
 * a CodeMirror completion source is an ordinary editor-scoped extension. Each
 * editor gets its own source closed over its own providers, so there is no
 * shared registry, no cross-editor merging, and nothing to unregister.
 *
 * Ordering mirrors the previous implementation via `boost` (CodeMirror's
 * equivalent of Monaco's `sortText` prefixes — higher sorts first):
 *   columns 3 · control-flow snippets 2 · keywords 1 · operators 0 · functions -1
 */

const IDENT_BEFORE = /[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Monaco snippet syntax → CodeMirror snippet syntax.
 *   `$0` / `${0:x}` (final tab stop) → `${}`
 *   `${1:cond}` (named placeholder)  → `${cond}`
 * CodeMirror numbers its placeholders by order of appearance, so the numeric
 * prefixes are simply dropped while the labels are preserved.
 */
function toCodeMirrorSnippet(monacoSnippet: string): string {
  return monacoSnippet
    .replace(/\$\{0:([^}]*)\}/g, '${}')
    .replace(/\$\{(\d+):([^}]*)\}/g, (_m, _n, label: string) => `\${${label}}`)
    .replace(/\$\{(\d+)\}/g, '${}')
    .replace(/\$0/g, '${}')
    .replace(/\$(\d+)/g, '${}');
}

function columnCompletion(
  c: { colId: string; headerName: string; dataType?: string },
  label: string,
  apply: string,
): Completion {
  return {
    label,
    detail: c.headerName + (c.dataType ? ` · ${c.dataType}` : ''),
    type: 'variable',
    apply,
    boost: 3,
  };
}

export function createExpressionCompletionSource(
  getColumns: () => ReturnType<ColumnsFn>,
  getFunctions: () => ReturnType<FunctionsFn>,
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.state.sliceDoc(0, context.pos);
    const word = context.matchBefore(IDENT_BEFORE);
    // Explicit invocation (Ctrl+Space) must open even on empty input; implicit
    // invocation waits for at least one identifier char or a trigger char.
    const triggerChar = before.slice(-1);
    const isTrigger = ['[', '{', '(', '.', ','].includes(triggerChar);
    if (!context.explicit && !word && !isTrigger) return null;

    const from = word ? word.from : context.pos;

    // Inside an unclosed `[` the user is naming a column — offer column ids
    // only, without the wrapping brackets (the closing one is auto-inserted).
    // `{` is deliberately NOT treated this way: it is ambiguous between the
    // legacy `{col}` reference and an `if (…) { … }` block body.
    if (findUnclosedBracket(before) === '[') {
      const options = getColumns().map((c) => columnCompletion(c, c.headerName, c.colId));
      return options.length ? { from, options, validFor: IDENT_BEFORE } : null;
    }

    const options: Completion[] = [
      ...getColumns().map((c) => columnCompletion(c, `[${c.colId}]`, `[${c.colId}]`)),

      ...OPERATORS_AND_KEYWORDS.map((k): Completion => {
        const boost = k.kind === 'control' ? 2 : k.kind === 'keyword' ? 1 : 0;
        const info = k.docs;
        if (k.snippet && k.insertText) {
          return snippetCompletion(toCodeMirrorSnippet(k.insertText), {
            label: k.label,
            detail: k.detail,
            type: k.kind === 'operator' ? 'operator' : k.kind === 'control' ? 'text' : 'keyword',
            ...(info ? { info } : {}),
            boost,
          });
        }
        return {
          label: k.label,
          detail: k.detail,
          type: k.kind === 'operator' ? 'operator' : 'keyword',
          apply: k.insertText ?? k.label,
          ...(info ? { info } : {}),
          boost,
        };
      }),

      ...getFunctions().map((f) =>
        snippetCompletion(`${f.name}(\${})`, {
          label: f.name,
          detail: f.signature,
          info: `${f.category} — ${f.description}`,
          type: 'function',
          boost: -1,
        }),
      ),
    ];

    return { from, options, validFor: IDENT_BEFORE };
  };
}

/** Full autocomplete extension for one editor instance. */
export function expressionAutocompletion(
  getColumns: () => ReturnType<ColumnsFn>,
  getFunctions: () => ReturnType<FunctionsFn>,
): Extension {
  return autocompletion({
    override: [createExpressionCompletionSource(getColumns, getFunctions)],
    activateOnTyping: true,
    closeOnBlur: true,
    icons: true,
    defaultKeymap: true,
  });
}

export { defaultFunctionsProvider };
