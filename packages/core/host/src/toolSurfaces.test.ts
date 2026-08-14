import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SurfaceHandle, SurfaceSpec } from '@wellsfargo-starui/types';
import type { RuntimePort } from './RuntimePort.js';
import { openProviderEditorSurface, openConfigBrowserSurface } from './toolSurfaces.js';

/**
 * The tool-surface helpers are the ONE definition of each tool window's
 * name/route/size. Worth pinning: the HashRouter URL shape (`?id=` inside
 * the fragment — the editor reads it via hash-aware useSearchParams), the
 * customData mirror for the OpenFin path, and the dimensions the dock
 * handlers share.
 */

const handle = { kind: 'popout', id: 'x', close: () => {}, onClosed: () => () => {} } as SurfaceHandle;

// The host member's suite runs under node — provide the minimal `window`
// the URL builder reads. (In real usage these helpers run in a DOM.)
const ORIGIN = 'http://app.test';
(globalThis as { window?: unknown }).window = { location: { origin: ORIGIN } };

let openSurface: ReturnType<typeof vi.fn>;
let runtime: RuntimePort;

beforeEach(() => {
  openSurface = vi.fn(async (_spec: SurfaceSpec) => handle);
  runtime = { openSurface } as unknown as RuntimePort;
});

describe('openProviderEditorSurface', () => {
  it('opens the data-providers window at the hash route with the shared dimensions', async () => {
    await openProviderEditorSurface(runtime);
    expect(openSurface).toHaveBeenCalledTimes(1);
    const spec = openSurface.mock.calls[0][0] as SurfaceSpec;
    expect(spec.kind).toBe('popout');
    expect(spec.windowName).toBe('data-providers');
    expect(spec.width).toBe(1180);
    expect(spec.height).toBe(760);
    expect(spec.url).toBe(`${ORIGIN}/#/dataproviders`);
    expect(spec.customData).toBeUndefined();
  });

  it('encodes providerId inside the fragment and mirrors it into customData', async () => {
    await openProviderEditorSurface(runtime, { providerId: 'px 1' });
    const spec = openSurface.mock.calls[0][0] as SurfaceSpec;
    expect(spec.url).toBe(`${ORIGIN}/#/dataproviders?id=px%201`);
    expect(spec.customData).toEqual({ providerId: 'px 1' });
  });

  it('honours a route override', async () => {
    await openProviderEditorSurface(runtime, { route: '/tools/providers' });
    const spec = openSurface.mock.calls[0][0] as SurfaceSpec;
    expect(spec.url).toBe(`${ORIGIN}/#/tools/providers`);
  });

  it('returns the runtime handle', async () => {
    await expect(openProviderEditorSurface(runtime)).resolves.toBe(handle);
  });
});

describe('openConfigBrowserSurface', () => {
  it('opens the config-browser window at the hash route with the shared dimensions', async () => {
    await openConfigBrowserSurface(runtime);
    const spec = openSurface.mock.calls[0][0] as SurfaceSpec;
    expect(spec.kind).toBe('popout');
    expect(spec.windowName).toBe('config-browser');
    expect(spec.width).toBe(1100);
    expect(spec.height).toBe(720);
    expect(spec.url).toBe(`${ORIGIN}/#/config-browser`);
  });

  it('honours a route override', async () => {
    await openConfigBrowserSurface(runtime, { route: '/cfg' });
    const spec = openSurface.mock.calls[0][0] as SurfaceSpec;
    expect(spec.url).toBe(`${ORIGIN}/#/cfg`);
  });
});
