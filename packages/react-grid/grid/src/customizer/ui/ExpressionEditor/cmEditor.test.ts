// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { StringStream } from '@codemirror/language';
import { expressionTokenizer, expressionLanguage } from './cmSyntax';
import { createExpressionCompletionSource } from './cmCompletions';
import { findUnclosedBracket, OPERATORS_AND_KEYWORDS } from './completionCatalog';

/**
 * Replaces the deleted Monaco-internals suites (editorDom / editorOptions /
 * monacoEnvironment tests) with coverage of the behaviour that actually
 * matters to users: DSL tokenisation, and the completion contract
 * (context-sensitivity, ordering, snippet expansion).
 */

const COLUMNS = [
  { colId: 'price', headerName: 'Price', dataType: 'number' },
  { colId: 'side', headerName: 'Side' },
];
const FUNCTIONS = [
  { name: 'SUM', category: 'Aggregation', signature: 'SUM(values… | [col])', description: 'Sum of values' },
];

function completionsAt(doc: string, explicit = false) {
  const state = EditorState.create({ doc, extensions: [expressionLanguage()] });
  const ctx = new CompletionContext(state, doc.length, explicit);
  const source = createExpressionCompletionSource(() => COLUMNS, () => FUNCTIONS);
  return source(ctx);
}

/** Drive the tokenizer directly over one line; returns token classes in order. */
function tokenise(line: string): string[] {
  const out: string[] = [];
  const stream = new StringStream(line, 2, 2, 0);
  let guard = 0;
  while (!stream.eol() && guard++ < 500) {
    stream.start = stream.pos;
    const tok = expressionTokenizer.token(stream);
    if (stream.pos === stream.start) stream.pos++; // never spin
    if (tok) out.push(tok);
  }
  return out;
}

describe('expression DSL tokenizer', () => {
  it('classifies column refs, functions, keywords, numbers and strings', () => {
    const names = tokenise('SUM([price]) > 100 AND [side] == "BUY"');
    // Stream-language node names are the tokenTable keys.
    expect(names).toContain('columnRef');
    expect(names).toContain('functionName');
    expect(names).toContain('keyword');
    expect(names).toContain('number');
    expect(names).toContain('string');
  });

  it('classifies the deprecated {col} form distinctly from [col]', () => {
    const names = tokenise('{price} > [price]');
    expect(names).toContain('deprecatedColumnRef');
    expect(names).toContain('columnRef');
  });

  it('treats a dotted path inside brackets as ONE column token', () => {
    const names = tokenise('[position.price]');
    expect(names.filter((n) => n === 'columnRef')).toHaveLength(1);
  });
});

describe('findUnclosedBracket', () => {
  it('detects an open column bracket', () => {
    expect(findUnclosedBracket('[pri')).toBe('[');
    expect(findUnclosedBracket('SUM([price]) > [si')).toBe('[');
  });

  it('returns null once brackets balance', () => {
    expect(findUnclosedBracket('[price]')).toBeNull();
    expect(findUnclosedBracket('SUM([price])')).toBeNull();
  });

  it('ignores brackets inside string literals', () => {
    expect(findUnclosedBracket('"text with ["')).toBeNull();
  });
});

describe('expression completions', () => {
  it('inside an open [ offers ONLY column ids, inserted without brackets', () => {
    const res = completionsAt('[pri');
    expect(res).not.toBeNull();
    const labels = res!.options.map((o) => o.label);
    expect(labels).toEqual(['Price', 'Side']);
    expect(res!.options.every((o) => o.type === 'variable')).toBe(true);
    expect(res!.options[0].apply).toBe('price');
  });

  it('in general position offers columns wrapped in brackets, plus keywords and functions', () => {
    const res = completionsAt('SUM([price]) > 1 A');
    expect(res).not.toBeNull();
    const labels = res!.options.map((o) => o.label);
    expect(labels).toContain('[price]');
    expect(labels).toContain('AND');
    expect(labels).toContain('SUM');
  });

  it('ranks columns above keywords above functions (boost ordering)', () => {
    const res = completionsAt('', true)!;
    const boostOf = (label: string) => res.options.find((o) => o.label === label)?.boost ?? 0;
    expect(boostOf('[price]')).toBeGreaterThan(boostOf('AND'));
    expect(boostOf('AND')).toBeGreaterThan(boostOf('SUM'));
  });

  it('returns null on implicit invocation with no word and no trigger char', () => {
    expect(completionsAt('')).toBeNull();
  });

  it('opens on explicit invocation even with an empty document', () => {
    const res = completionsAt('', true);
    expect(res).not.toBeNull();
    expect(res!.options.length).toBeGreaterThan(0);
  });

  it('converts Monaco snippet syntax to CodeMirror placeholders', () => {
    // IN was `IN [$0]`; BETWEEN was `BETWEEN $1 AND $0`; CASE used ${1:cond}.
    const res = completionsAt('', true)!;
    const names = res.options.map((o) => o.label);
    expect(names).toContain('IN');
    expect(names).toContain('BETWEEN');
    // Snippet entries carry an apply FUNCTION (CodeMirror snippets), not a
    // raw string containing Monaco's `$0` / `${1:...}` markers.
    for (const label of ['IN', 'BETWEEN', 'CASE']) {
      const opt = res.options.find((o) => o.label === label)!;
      expect(typeof opt.apply).toBe('function');
    }
  });

  it('every catalogue entry surfaces as a completion', () => {
    const res = completionsAt('', true)!;
    const labels = new Set(res.options.map((o) => o.label));
    for (const spec of OPERATORS_AND_KEYWORDS) {
      expect(labels.has(spec.label)).toBe(true);
    }
  });
});
