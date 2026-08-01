import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';

/**
 * createAppDataServices is a thin bootstrap wrapper, and everything worth
 * asserting is what it hands the SharedWorker bootstrap: the REST URL it
 * settled on and the user id it defaulted. The bootstrap itself is the
 * boundary, so it is mocked at the module edge.
 */

const bootstrap = vi.fn();

vi.mock('@wellsfargo-starui/data/runtime', () => ({
  bootstrapDataServicesWithWorkerAsset: (...args: unknown[]) => bootstrap(...args),
}));

const { createAppDataServices } = await import('./createAppDataServices.js');

beforeEach(() => {
  bootstrap.mockReset().mockResolvedValue({ client: {} });
});

describe('createAppDataServices', () => {
  it('forwards the worker URL, app name and static REST URL', async () => {
    await createAppDataServices({
      appName: 'star-demo',
      workerScriptUrl: 'https://cdn.example/worker.mjs',
      configServiceRestUrl: 'https://cfg.example',
    });

    expect(bootstrap).toHaveBeenCalledWith('https://cdn.example/worker.mjs', {
      appName: 'star-demo',
      userId: LOGGED_IN_USER_ID,
      configServiceRestUrl: 'https://cfg.example',
    });
  });

  it('leaves the worker URL undefined so the library resolves its own asset', async () => {
    await createAppDataServices({ appName: 'star-demo' });

    expect(bootstrap).toHaveBeenCalledWith(undefined, expect.objectContaining({ appName: 'star-demo' }));
  });

  it('awaits the async resolver when no static REST URL is given', async () => {
    const resolveConfigServiceRestUrl = vi.fn().mockResolvedValue('https://from-manifest.example');

    await createAppDataServices({ appName: 'star-demo', resolveConfigServiceRestUrl });

    expect(resolveConfigServiceRestUrl).toHaveBeenCalledTimes(1);
    expect(bootstrap).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ configServiceRestUrl: 'https://from-manifest.example' }),
    );
  });

  it('prefers the static REST URL over the resolver, and never calls it', async () => {
    // The resolver reads the OpenFin manifest — an avoidable round-trip when
    // the caller already knows the URL.
    const resolveConfigServiceRestUrl = vi.fn().mockResolvedValue('https://from-manifest.example');

    await createAppDataServices({
      appName: 'star-demo',
      configServiceRestUrl: 'https://static.example',
      resolveConfigServiceRestUrl,
    });

    expect(resolveConfigServiceRestUrl).not.toHaveBeenCalled();
    expect(bootstrap).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ configServiceRestUrl: 'https://static.example' }),
    );
  });

  it('passes through an explicit user id instead of the pinned default', async () => {
    await createAppDataServices({ appName: 'star-demo', userId: 'k123' });

    expect(bootstrap).toHaveBeenCalledWith(undefined, expect.objectContaining({ userId: 'k123' }));
  });

  it('runs with no REST URL at all when neither source supplies one', async () => {
    await createAppDataServices({ appName: 'star-demo' });

    expect(bootstrap).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ configServiceRestUrl: undefined }),
    );
  });

  it('returns whatever the bootstrap resolved', async () => {
    const services = { client: { id: 'client-1' } };
    bootstrap.mockResolvedValue(services);

    await expect(createAppDataServices({ appName: 'star-demo' })).resolves.toBe(services);
  });
});
