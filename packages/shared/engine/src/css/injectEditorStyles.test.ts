import { describe, expect, it } from 'vitest';
import { injectEditorStyles } from './injectEditorStyles';

describe('injectEditorStyles', () => {
  it('injects dock-editor CSS once into document head', () => {
    document.head.querySelectorAll('[data-dock-editor-styles]').forEach((n) => n.remove());
    injectEditorStyles();
    const first = document.head.querySelector('[data-dock-editor-styles]');
    expect(first).toBeTruthy();
    expect(first?.textContent).toContain('--de-accent');
    injectEditorStyles();
    expect(document.head.querySelectorAll('[data-dock-editor-styles]')).toHaveLength(1);
  });
});
