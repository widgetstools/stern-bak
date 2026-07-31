import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { lintFile } from './check-ds-tokens';

const fix = (n: string) => resolve(__dirname, '__fixtures__', n);

describe('check-ds-tokens', () => {
  it('passes a clean file', () => {
    expect(lintFile(fix('clean.tsx'))).toEqual([]);
  });

  it('flags hardcoded hex literal', () => {
    const issues = lintFile(fix('dirty-hex.tsx'));
    expect(issues.some(i => i.rule === 'no-hardcoded-hex')).toBe(true);
  });

  it('flags legacy --bn-* var ref', () => {
    const issues = lintFile(fix('dirty-legacy-var.css'));
    expect(issues.some(i => i.rule === 'no-legacy-css-var')).toBe(true);
  });

  it('flags style={{ … }} inline color', () => {
    const issues = lintFile(fix('dirty-inline-style.tsx'));
    expect(issues.some(i => i.rule === 'no-inline-style')).toBe(true);
  });
});
