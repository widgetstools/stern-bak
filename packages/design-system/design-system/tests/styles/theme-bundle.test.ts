import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const themeCss = readFileSync(
  resolve(__dirname, '../../dist/css/theme.css'),
  'utf8',
);

describe('dist/css/theme.css bundle order', () => {
  it('places @import before any :root or @layer rules (PostCSS/Vite requirement)', () => {
    const importIdx = themeCss.indexOf('@import url(');
    const rootIdx = themeCss.indexOf(':root');
    const layerIdx = themeCss.indexOf('@layer');
    expect(importIdx).toBeGreaterThanOrEqual(0);
    expect(rootIdx).toBeGreaterThan(importIdx);
    expect(layerIdx).toBeGreaterThan(importIdx);
  });

  it('does not contain a second mid-file @import after tokens', () => {
    const afterTokens = themeCss.indexOf('.dark, [data-theme="dark"]');
    const midImport = themeCss.indexOf('@import url(', afterTokens);
    expect(midImport).toBe(-1);
  });
});
