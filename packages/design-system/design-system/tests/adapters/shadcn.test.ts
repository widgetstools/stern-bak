import { describe, it, expect } from 'vitest';
import { generateUnifiedCSS } from '../../src/adapters/shadcn';

describe('generateCompatCSS (via generateUnifiedCSS)', () => {
  const css = generateUnifiedCSS();

  it('contains @layer base', () => {
    expect(css).toMatch(/@layer base \{/);
  });

  it('contains shared compat block for all theme roots', () => {
    expect(css).toMatch(/:root,\s*\[data-theme="dark"\],\s*\[data-theme="light"\]\s*\{/);
  });

  it('contains [data-theme="dark"][data-cvd="on"] CVD override', () => {
    expect(css).toMatch(/\[data-theme="dark"\]\[data-cvd="on"\]\s*\{/);
  });

  it('contains [data-theme="light"][data-cvd="on"] CVD override', () => {
    expect(css).toMatch(/\[data-theme="light"\]\[data-cvd="on"\]\s*\{/);
  });

  it('emits --ds-* bridge vars (e.g. --ds-surface-ground)', () => {
    expect(css).toMatch(/--ds-surface-ground:\s*oklch\(var\(--background\)\)/);
  });

  it('emits PrimeNG --p-* aliases (e.g. --p-primary-color)', () => {
    expect(css).toMatch(/--p-primary-color:\s*oklch\(var\(--primary\)\)/);
  });

  it('emits surface scale referencing OKLCH token components', () => {
    expect(css).toMatch(/--surface-50:\s*var\(--card\)/);
    expect(css).toMatch(/--surface-950:\s*var\(--foreground\)/);
  });

  it('maps control density to starui-tokens.css vars', () => {
    expect(css).toMatch(/--ds-control-md-height:\s*var\(--control-h\)/);
  });

  it('matches snapshot', () => {
    expect(css).toMatchSnapshot();
  });
});
