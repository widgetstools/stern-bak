import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { readViteDevPort } from '../../../test-utils/vitePort';
import { mockOpenSurface, resetStaruiMocks } from './staruiVitestMocks';
import { openProviderEditorPopout } from './dataProvidersPopout';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('openProviderEditorPopout', () => {
  const runtime = { openSurface: mockOpenSurface } as never;
  let origin = `http://localhost:${readViteDevPort(appRoot)}`;

  beforeEach(() => {
    resetStaruiMocks();
    origin = `http://localhost:${readViteDevPort(appRoot)}`;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin },
    });
  });

  it('opens default dataproviders route', async () => {
    await openProviderEditorPopout(runtime);

    expect(mockOpenSurface).toHaveBeenCalledWith({
      kind: 'popout',
      url: `${origin}/#/dataproviders`,
      windowName: 'data-providers',
      width: 1180,
      height: 760,
      customData: undefined,
    });
  });

  it('includes provider id in url and customData', async () => {
    await openProviderEditorPopout(runtime, { providerId: 'stomp-1' });

    expect(mockOpenSurface).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${origin}/#/dataproviders?id=stomp-1`,
        customData: { providerId: 'stomp-1' },
      }),
    );
  });

  it('supports custom route', async () => {
    await openProviderEditorPopout(runtime, { route: '/custom', providerId: 'a b' });

    expect(mockOpenSurface).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${origin}/#/custom?id=a%20b`,
      }),
    );
  });
});
