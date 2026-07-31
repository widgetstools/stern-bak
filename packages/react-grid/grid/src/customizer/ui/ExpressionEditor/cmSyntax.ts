import { StreamLanguage, LanguageSupport, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t, Tag } from '@lezer/highlight';

/**
 * CodeMirror 6 stream tokenizer for the ExpressionEngine DSL.
 *
 * Replaces the former Monaco Monarch grammar. Token classes map 1:1 to the
 * old ones so the editor looks identical:
 *   `[columnId]`   → column reference          (was `variable.predefined`)
 *   `{columnId}`   → DEPRECATED column ref     (was `variable.deprecated`)
 *   `IDENT(`       → function call             (was `support.function`)
 *   keywords, numbers, strings, operators, brackets
 *
 * A stream tokenizer (rather than a full Lezer grammar) is the right tool
 * here: the DSL is single-line-ish and regular, we need no incremental
 * parse tree, and this keeps the whole language definition under 100 lines
 * with no build step.
 */

/** Custom tag for the deprecated `{col}` form so it can be styled apart. */
export const deprecatedColumnTag = Tag.define();
/** Custom tag for the canonical `[col]` form. */
export const columnRefTag = Tag.define();

const KEYWORDS = new Set([
  'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'TRUE', 'FALSE', 'NULL',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IF', 'RETURN',
]);

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;

/**
 * The raw stream-parser spec. Exported separately from the `StreamLanguage`
 * so tests can drive `token()` directly with a `StringStream` instead of
 * reaching into CodeMirror internals.
 */
export const expressionTokenizer = {
  name: 'wfExpression',
  token(stream: import('@codemirror/language').StringStream): string | null {
    if (stream.eatSpace()) return null;

    const ch = stream.peek()!;

    // `[col]` / `[col.nested]` — canonical column reference.
    if (ch === '[') {
      const start = stream.pos;
      stream.next();
      if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*\]/)) {
        return 'columnRef';
      }
      stream.pos = start;
      stream.next();
      return 'squareBracket';
    }

    // `{col}` — deprecated column reference (kept highlightable so the
    // deprecation lint has something to point at).
    if (ch === '{') {
      const start = stream.pos;
      stream.next();
      if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*\}/)) {
        return 'deprecatedColumnRef';
      }
      stream.pos = start;
      stream.next();
      return 'brace';
    }

    // Strings — single and double quoted, backslash escapes.
    if (ch === '"' || ch === "'") {
      stream.next();
      let escaped = false;
      let next: string | void;
      while ((next = stream.next()) != null) {
        if (next === ch && !escaped) break;
        escaped = !escaped && next === '\\';
      }
      return 'string';
    }

    // Numbers (int + float).
    if (/\d/.test(ch)) {
      stream.match(/^\d+(?:\.\d+)?/);
      return 'number';
    }

    // Identifiers → function call (when followed by `(`) or keyword or plain.
    if (IDENT_START.test(ch)) {
      let word = '';
      while (stream.peek() != null && IDENT_PART.test(stream.peek()!)) {
        word += stream.next();
      }
      // Peek past spaces for an opening paren → function call.
      const rest = stream.string.slice(stream.pos);
      if (/^\s*\(/.test(rest)) return 'functionName';
      if (KEYWORDS.has(word.toUpperCase())) return 'keyword';
      return 'variableName';
    }

    // Multi-character operators first, then single.
    if (stream.match(/^(==|!=|<>|<=|>=|&&|\|\|)/)) return 'operator';
    if (stream.match(/^[+\-*/%<>!]/)) return 'operator';

    if (stream.match(/^[()]/)) return 'paren';
    if (stream.match(/^[,.]/)) return 'punctuation';
    if (stream.match(/^[[\]]/)) return 'squareBracket';
    if (stream.match(/^[{}]/)) return 'brace';

    stream.next();
    return null;
  },
  tokenTable: {
    columnRef: columnRefTag,
    deprecatedColumnRef: deprecatedColumnTag,
    functionName: t.function(t.variableName),
    keyword: t.keyword,
    number: t.number,
    string: t.string,
    operator: t.operator,
    variableName: t.variableName,
    paren: t.paren,
    squareBracket: t.squareBracket,
    brace: t.brace,
    punctuation: t.punctuation,
  },
};

export const expressionStreamParser = StreamLanguage.define(expressionTokenizer);

/**
 * Highlight style. Colours resolve through CSS custom properties defined in
 * `expressionEditor.css`, so light/dark switching is a pure CSS event — the
 * former Monaco integration needed a MutationObserver on `data-theme` plus a
 * `monaco.editor.setTheme()` call to achieve the same thing.
 */
export const expressionHighlightStyle = HighlightStyle.define([
  { tag: columnRefTag, color: 'var(--ds-expr-column)' },
  { tag: deprecatedColumnTag, color: 'var(--ds-expr-deprecated)', fontStyle: 'italic' },
  { tag: t.function(t.variableName), color: 'var(--ds-expr-function)' },
  { tag: t.keyword, color: 'var(--ds-expr-keyword)' },
  { tag: t.operator, color: 'var(--ds-expr-operator)' },
  { tag: t.number, color: 'var(--ds-expr-number)' },
  { tag: t.string, color: 'var(--ds-expr-string)' },
  { tag: t.variableName, color: 'var(--ds-expr-identifier)' },
  { tag: [t.paren, t.squareBracket, t.brace, t.punctuation], color: 'var(--ds-expr-punctuation)' },
]);

/** The language extension to hand to CodeMirror. */
export function expressionLanguage(): LanguageSupport {
  return new LanguageSupport(expressionStreamParser, [
    syntaxHighlighting(expressionHighlightStyle),
  ]);
}
