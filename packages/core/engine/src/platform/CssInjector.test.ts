// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { CssInjector } from './CssInjector';

/**
 * Contract under test: rule upserts are microtask-coalesced — a burst
 * of add/remove calls lands as ONE textContent write — and re-adding
 * identical rule text performs no DOM write at all (the reinjection
 * paths re-add every rule on every transform pass).
 */

const flushMicrotasks = () => new Promise<void>((r) => queueMicrotask(r));

function styleEl(gridId: string): HTMLStyleElement | null {
  return document.head.querySelector(`style[data-ds-grid="${gridId}"]`);
}

function countTextContentSets(el: HTMLStyleElement): () => number {
  let sets = 0;
  const proto = Object.getPrototypeOf(el) as object;
  const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
  Object.defineProperty(el, 'textContent', {
    configurable: true,
    get() { return desc.get!.call(this); },
    set(v: string) {
      sets += 1;
      desc.set!.call(this, v);
    },
  });
  void proto;
  return () => sets;
}

afterEach(() => {
  document.head.querySelectorAll('style[data-ds-grid]').forEach((el) => el.remove());
});

describe('CssInjector — coalesced, change-gated flushes', () => {
  it('coalesces a burst of addRule calls into one write on the next microtask', async () => {
    const css = new CssInjector('g1', 'm1');
    css.addRule('a', '.a { color: red; }');
    css.addRule('b', '.b { color: blue; }');
    css.addRule('c', '.c { color: green; }');

    // Same tick: nothing written yet (no element or empty content).
    expect(styleEl('g1')?.textContent ?? '').toBe('');

    await flushMicrotasks();
    const el = styleEl('g1')!;
    expect(el.textContent).toBe('.a { color: red; }\n.b { color: blue; }\n.c { color: green; }');

    // A follow-up burst of remove + add lands as exactly one more write.
    const sets = countTextContentSets(el);
    css.removeRule('b');
    css.addRule('d', '.d { color: black; }');
    await flushMicrotasks();
    expect(sets()).toBe(1);
    expect(el.textContent).toBe('.a { color: red; }\n.c { color: green; }\n.d { color: black; }');
  });

  it('re-adding identical rule text performs zero DOM writes', async () => {
    const css = new CssInjector('g2', 'm1');
    css.addRule('a', '.a { color: red; }');
    await flushMicrotasks();
    const el = styleEl('g2')!;
    const sets = countTextContentSets(el);

    css.addRule('a', '.a { color: red; }'); // steady-state re-transform
    await flushMicrotasks();
    expect(sets()).toBe(0);
  });

  it('destroy removes the style element and cancels pending flushes', async () => {
    const css = new CssInjector('g3', 'm1');
    css.addRule('a', '.a { color: red; }');
    css.destroy();
    await flushMicrotasks();
    expect(styleEl('g3')).toBeNull();
  });

  it('clear removes all rules and skips when already empty', async () => {
    const css = new CssInjector('g4', 'm1');
    css.clear();
    css.addRule('a', '.a { color: red; }');
    await flushMicrotasks();
    css.clear();
    await flushMicrotasks();
    expect(styleEl('g4')?.textContent ?? '').toBe('');
    css.clear();
  });

  it('removeRule skips flush when rule id was absent', async () => {
    const css = new CssInjector('g5', 'm1');
    css.removeRule('missing');
    await flushMicrotasks();
    expect(styleEl('g5')).toBeNull();
  });

  it('flushes synchronously when queueMicrotask is unavailable', async () => {
    const original = globalThis.queueMicrotask;
    // @ts-expect-error test override
    globalThis.queueMicrotask = undefined;
    try {
      const css = new CssInjector('g6', 'm1');
      css.addRule('a', '.a { color: red; }');
      expect(styleEl('g6')?.textContent).toContain('color: red');
    } finally {
      globalThis.queueMicrotask = original;
    }
  });
});
