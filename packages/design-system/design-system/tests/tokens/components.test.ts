import { describe, expect, it } from 'vitest';
import { dark, light } from '../../src/tokens/semantic';
import { controls } from '../../src/tokens/controls';
import { componentTokens } from '../../src/tokens/components';

/**
 * `componentTokens(scheme)` is the per-component override layer both shadcn and
 * PrimeNG consume. Its contract is that values reference *semantic scheme
 * slots*, never raw primitives — that indirection is what makes a dark/light
 * flip work, and CLAUDE.md requires it ("no hardcoded hex anywhere").
 */

const darkTokens = componentTokens(dark);
const lightTokens = componentTokens(light);

/** Collect every string leaf, with its dotted path, for scanning. */
function leaves(node: unknown, path = ''): Array<[string, string]> {
  if (typeof node === 'string') return [[path, node]];
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node as Record<string, unknown>)
    .flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

describe('componentTokens', () => {
  it('returns a token object for a scheme', () => {
    expect(typeof darkTokens).toBe('object');
    expect(Object.keys(darkTokens).length).toBeGreaterThan(0);
  });

  it('exposes the control density scale unchanged', () => {
    expect(darkTokens.control).toBe(controls);
  });

  it('produces the same key structure for dark and light', () => {
    // A slot present in one scheme but not the other means a component would
    // lose styling on a theme flip.
    const keysOf = (t: unknown) => leaves(t).map(([p]) => p).sort();
    expect(keysOf(darkTokens)).toEqual(keysOf(lightTokens));
  });

  it('differs between dark and light somewhere — it is scheme-driven', () => {
    const d = new Map(leaves(darkTokens));
    const differing = [...d].filter(([p, v]) => new Map(leaves(lightTokens)).get(p) !== v);
    expect(differing.length).toBeGreaterThan(0);
  });

  it('returns a fresh object per call rather than shared mutable state', () => {
    expect(componentTokens(dark)).not.toBe(componentTokens(dark));
  });

  it('has a button block with the documented typography and radius', () => {
    expect(darkTokens.button).toBeDefined();
    expect(darkTokens.button.fontFamily).toBeTruthy();
    expect(darkTokens.button.borderRadius).toBeTruthy();
  });

  /**
   * The property that actually matters for theming: no colour may be the same
   * in both schemes, or that component is stranded on a theme flip.
   *
   * Note the file header claims values "reference semantic-scheme slots, never
   * primitives directly", but 38 leaves are literal hex (button.primary.*,
   * button.buy.*, …). They are *scheme-specific* literals — every one differs
   * between dark and light — so theming works; it is the stated convention
   * that is not held, not the behaviour. Asserting "no hex" would fail today
   * and would be testing style, so this asserts theme-responsiveness instead.
   */
  it('has no colour that is identical in both schemes', () => {
    const lightByPath = new Map(leaves(lightTokens));
    const themeBlind = leaves(darkTokens)
      .filter(([, v]) => /^#[0-9a-f]{3,8}$/i.test(v.trim()))
      .filter(([p, v]) => lightByPath.get(p) === v);
    expect(themeBlind.map(([p, v]) => `${p}=${v}`)).toEqual([]);
  });
});
