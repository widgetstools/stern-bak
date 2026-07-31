import { describe, expect, it, vi } from 'vitest';
import { CONFIG_BROWSER_ACTION_ID, createConfigBrowserAction } from './helpers';

/**
 * `createConfigBrowserAction` feeds the MarketsGrid settings-sheet Tools
 * menu. The grid keys entries by `id` and gates them on `visible`, so both
 * defaults are load-bearing: a changed default id silently breaks the
 * `admin-action-config-browser` e2e hook, and a `visible` that defaulted to
 * `false` would make the entry vanish for every consumer that doesn't pass one.
 */
describe('createConfigBrowserAction', () => {
  it('fills every field a consumer did not supply', () => {
    const launch = vi.fn();

    const action = createConfigBrowserAction({ launch });

    expect(action).toEqual({
      id: CONFIG_BROWSER_ACTION_ID,
      label: 'Config Browser',
      icon: 'lucide:database',
      description: 'Inspect and edit raw ConfigService rows',
      onClick: launch,
      visible: true,
    });
  });

  it('exposes the caller\'s launch callback as onClick, unwrapped', async () => {
    const launch = vi.fn().mockResolvedValue(undefined);

    const action = createConfigBrowserAction({ launch });
    await action.onClick?.();

    // Identity, not a wrapper: the grid may inspect or re-bind onClick.
    expect(action.onClick).toBe(launch);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('honours every override', () => {
    const action = createConfigBrowserAction({
      launch: vi.fn(),
      id: 'config-browser-trading',
      label: 'Trading config',
      description: 'Trading desk rows only',
      visible: false,
    });

    expect(action.id).toBe('config-browser-trading');
    expect(action.label).toBe('Trading config');
    expect(action.description).toBe('Trading desk rows only');
    expect(action.visible).toBe(false);
  });

  it('keeps visible === false rather than falling back to the default', () => {
    // `??` not `||` — a role-gated action must stay hidden.
    expect(createConfigBrowserAction({ launch: vi.fn(), visible: false }).visible).toBe(false);
    expect(createConfigBrowserAction({ launch: vi.fn(), visible: true }).visible).toBe(true);
  });

  it('keeps an empty-string override rather than falling back to the default', () => {
    // Same `??` distinction: '' is a deliberate (if odd) caller choice.
    const action = createConfigBrowserAction({ launch: vi.fn(), id: '', label: '', description: '' });

    expect(action.id).toBe('');
    expect(action.label).toBe('');
    expect(action.description).toBe('');
  });

  it('is a fresh object per call — two entries must not alias', () => {
    const a = createConfigBrowserAction({ launch: vi.fn() });
    const b = createConfigBrowserAction({ launch: vi.fn() });

    expect(a).not.toBe(b);
  });
});
