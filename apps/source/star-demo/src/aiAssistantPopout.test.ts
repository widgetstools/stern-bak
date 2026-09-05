import { describe, it, expect, vi } from 'vitest';
import type { RuntimePort } from '@wellsfargo-starui/core/host';
import { buildAssistantUrl, openAssistantPopout } from './aiAssistantPopout';

function fakeRuntime() {
  const openSurface = vi.fn().mockResolvedValue(undefined);
  return { runtime: { openSurface } as unknown as RuntimePort, openSurface };
}

describe('buildAssistantUrl', () => {
  it('always carries the window\'s own instance id, locked', () => {
    const url = new URL(buildAssistantUrl({ instanceId: 'dev1grid-test-1700000000000' }));
    const params = new URLSearchParams(url.hash.slice(url.hash.indexOf('?')));
    expect(params.get('instance')).toBe('dev1grid-test-1700000000000');
    expect(params.get('scope')).toBe('locked');
  });

  it('forwards the template id only when the caller actually knows one', () => {
    const withId = buildAssistantUrl({ instanceId: 'i-1', gridId: 'grid-test' });
    expect(withId).toContain('grid=grid-test');
    expect(buildAssistantUrl({ instanceId: 'i-1' })).not.toContain('grid=');
  });
});

describe('openAssistantPopout', () => {
  it('names the window after the instance, not the blotter', async () => {
    const { runtime, openSurface } = fakeRuntime();
    await openAssistantPopout(runtime, { instanceId: 'dev1grid-test-1700000000000', gridId: 'grid-test' });
    expect(openSurface).toHaveBeenCalledWith(
      expect.objectContaining({ windowName: 'ai-assistant-dev1grid-test-1700000000000' }),
    );
  });

  /**
   * The regression this guards. Naming the window after `gridId` — the template
   * configId every window of a blotter shares — gave two windows ONE assistant.
   * And it was silently scoped to the wrong one: `openOpenFinPopout` re-navigates
   * an existing window only when `urlsSameDocument` reports a difference, and
   * that compares origin/pathname/search but NOT the hash. Every assistant URL
   * puts its instance id in the hash, so the second wand click foregrounded an
   * assistant still pinned to the first window.
   */
  it('gives two windows of the SAME blotter two different assistants', async () => {
    const { runtime, openSurface } = fakeRuntime();
    const gridId = 'grid-test';

    await openAssistantPopout(runtime, { instanceId: 'dev1grid-test-1700000000001', gridId });
    await openAssistantPopout(runtime, { instanceId: 'dev1grid-test-1700000000002', gridId });

    const names = openSurface.mock.calls.map((c) => (c[0] as { windowName: string }).windowName);
    expect(new Set(names).size).toBe(2);
  });

  it('still distinguishes them when no template id is known at all', async () => {
    const { runtime, openSurface } = fakeRuntime();
    await openAssistantPopout(runtime, { instanceId: 'i-1' });
    await openAssistantPopout(runtime, { instanceId: 'i-2' });
    const names = openSurface.mock.calls.map((c) => (c[0] as { windowName: string }).windowName);
    expect(names).toEqual(['ai-assistant-i-1', 'ai-assistant-i-2']);
  });
});
