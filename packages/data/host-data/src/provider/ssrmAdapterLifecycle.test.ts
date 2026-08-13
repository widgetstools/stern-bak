/**
 * `setViewport` is fired-and-forgotten by the datasource (`void provider
 * .setViewport(...)`). If it throws once the provider has stopped, the
 * rejection has no handler — it surfaces as an unhandled promise rejection,
 * which pollutes the console and trips app-level error reporting.
 *
 * A viewport update after teardown is a no-op, not an error.
 */
import { describe, expect, it, vi } from 'vitest';
import { SsrmProviderClientAdapter } from './SsrmProviderClientAdapter.js';

function stoppedAdapter() {
  const client = {
    ssrmSetViewport: vi.fn(),
    ssrmGetRows: vi.fn(),
  } as never;
  // Never started -> no handle -> the sessionId getter throws.
  return new SsrmProviderClientAdapter({
    providerId: 'p1',
    client,
    inlineCfg: { providerType: 'mock-ssrm' } as never,
  });
}

describe('SsrmProviderClientAdapter after teardown', () => {
  it('resolves setViewport quietly when the provider is not started', async () => {
    const adapter = stoppedAdapter();

    await expect(adapter.setViewport(['a'])).resolves.toBeUndefined();
  });

  it('does not forward the viewport to the worker when not started', async () => {
    const adapter = stoppedAdapter();
    const client = (adapter as unknown as { client: { ssrmSetViewport: ReturnType<typeof vi.fn> } })
      .client;

    await adapter.setViewport(['a']);

    expect(client.ssrmSetViewport).not.toHaveBeenCalled();
  });

  it('still surfaces failures from getRows, which the datasource does handle', async () => {
    const adapter = stoppedAdapter();

    await expect(adapter.getRows({ startRow: 0, endRow: 1 } as never)).rejects.toThrow(
      /not started/i,
    );
  });
});
