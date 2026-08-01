import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const appDir = dirname(fileURLToPath(import.meta.url));

describe('vite.config', () => {
  it('defines react plugin and a dev server port', () => {
    const source = readFileSync(join(appDir, 'vite.config.ts'), 'utf8');
    expect(source).toContain('@vitejs/plugin-react');
    expect(source).toMatch(/port:\s*\d+/);
  });
});
