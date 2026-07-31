import { describe, it, expect } from 'vitest';
import { tailwindPreset } from '../../src/adapters/tailwind';

describe('tailwindPreset', () => {
  it('sets darkMode to data-theme attribute selector', () => {
    expect(tailwindPreset.darkMode).toEqual(['selector', '[data-theme="dark"]']);
  });

  it('exposes shadcn-compat color names via theme.extend.colors', () => {
    const colors = tailwindPreset.theme?.extend?.colors as Record<string, unknown>;
    for (const k of [
      'background', 'foreground', 'card', 'popover', 'primary', 'secondary',
      'muted', 'accent', 'destructive', 'border', 'input', 'ring',
      'success', 'warning', 'info',
    ]) {
      expect(colors[k]).toBeDefined();
    }
  });

  it('wraps OKLCH tokens with <alpha-value> for opacity modifiers', () => {
    const colors = tailwindPreset.theme?.extend?.colors as Record<string, string>;
    expect(colors.background).toBe('oklch(var(--background) / <alpha-value>)');
    expect((colors.primary as { DEFAULT: string }).DEFAULT)
      .toBe('oklch(var(--primary) / <alpha-value>)');
  });

  it('maps Tailwind font sizes to StarUI density tokens', () => {
    const fontSize = tailwindPreset.theme?.extend?.fontSize as Record<string, string[]>;
    expect(fontSize.sm[0]).toBe('var(--text-sm)');
    expect(fontSize.md[0]).toBe('var(--text-md)');
  });

  it('exposes control density height/size utilities', () => {
    const height = tailwindPreset.theme?.extend?.height as Record<string, string>;
    const size = tailwindPreset.theme?.extend?.size as Record<string, string>;
    expect(height.control).toBe('var(--control-h)');
    expect(size['control-sm']).toBe('var(--control-h-sm)');
  });

  it('exposes surface scale 50..950 for parity with PrimeNG', () => {
    const colors = tailwindPreset.theme?.extend?.colors as any;
    for (const k of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
      expect(colors.surface[k]).toBeDefined();
    }
  });

  it('matches snapshot', () => {
    expect(tailwindPreset).toMatchSnapshot();
  });
});
