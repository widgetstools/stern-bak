/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import { useHostedIdentity } from '../useHostedIdentity.js';

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
});

const fakeConfigManager = { __fake: true } as unknown as ConfigManager;

function stubFin(customData: Record<string, unknown>): void {
  (globalThis as any).fin = {
    me: { getOptions: vi.fn().mockResolvedValue({ customData }) },
  };
}

describe('useHostedIdentity — templateAuthoring', () => {
  it("reads Workspace Setup's templateAuthoring flag from customData", async () => {
    stubFin({ instanceId: 'grid-credit', templateId: 'grid-credit', isTemplate: true, templateAuthoring: true });
    const { result } = renderHook(() =>
      useHostedIdentity({ defaultInstanceId: 'fallback', componentName: 'TestGrid', configManager: fakeConfigManager }),
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.identity.templateAuthoring).toBe(true);
  });

  it('is false for a dock launch of the same template row', async () => {
    stubFin({ instanceId: 'grid-credit', templateId: 'grid-credit', isTemplate: true, singleton: false });
    const { result } = renderHook(() =>
      useHostedIdentity({ defaultInstanceId: 'fallback', componentName: 'TestGrid', configManager: fakeConfigManager }),
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.identity.templateAuthoring).toBe(false);
  });

  it('is false outside OpenFin', () => {
    const { result } = renderHook(() =>
      useHostedIdentity({ defaultInstanceId: 'fallback', componentName: 'TestGrid', configManager: fakeConfigManager }),
    );
    expect(result.current.identity.templateAuthoring).toBe(false);
  });
});
