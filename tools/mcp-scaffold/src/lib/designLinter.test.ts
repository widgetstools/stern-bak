import { describe, it, expect } from 'vitest';
import { lintDesignCompliance } from './designLinter.js';

describe('designLinter', () => {
  it('flags hardcoded hex', () => {
    const violations = lintDesignCompliance([
      { path: 'App.tsx', content: '<div style={{ color: "#fff" }} />' },
    ]);
    expect(violations.some((v) => v.rule === 'no-hardcoded-color')).toBe(true);
  });

  it('passes token-based styles', () => {
    const violations = lintDesignCompliance([
      {
        path: 'App.tsx',
        content: "import { Button } from '@wellsfargo-starui/ui';\n<div style={{ color: 'var(--ds-text-primary)' }}><Button /></div>",
      },
      {
        path: 'src/globals.css',
        content: "@import '@wellsfargo-starui/design-system/css';\n@import '@wellsfargo-starui/grid/styles.css';",
      },
    ]);
    expect(violations).toHaveLength(0);
  });
});
