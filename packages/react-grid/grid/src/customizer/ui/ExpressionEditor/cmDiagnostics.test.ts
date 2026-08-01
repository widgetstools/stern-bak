// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expressionLanguage } from './cmSyntax';
import { expressionLinter } from './cmDiagnostics';

describe('expressionLinter', () => {
  it('installs without error on invalid DSL input', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'SUM([price',
        extensions: [expressionLanguage(), expressionLinter({ warnDeprecated: false })],
      }),
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(view.state.doc.toString()).toBe('SUM([price');
    view.destroy();
    document.body.removeChild(parent);
  });

  it('accepts warnDeprecated flag for {col} syntax', async () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: '{price} > 0',
        extensions: [expressionLanguage(), expressionLinter({ warnDeprecated: true })],
      }),
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(view.state.doc.toString()).toContain('{price}');
    view.destroy();
    document.body.removeChild(parent);
  });
});
