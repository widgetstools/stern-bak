import React from 'react';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

export const staruiTestState = {
  configStore: {
    list: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  },
  platform: {
    configManager: { init: vi.fn() },
  },
  ensurePlatformReady: vi.fn(),
  resolvePlatformBootstrapFromJson: vi.fn(),
};

vi.mock('@wellsfargo-starui/data', () => ({
  ensurePlatformReady: (...args: unknown[]) => staruiTestState.ensurePlatformReady(...args),
  resolvePlatformBootstrapFromJson: (...args: unknown[]) =>
    staruiTestState.resolvePlatformBootstrapFromJson(...args),
}));

vi.mock('@wellsfargo-starui/data/assets/data-services-worker.mjs?url', () => ({
  default: '/mock-worker.mjs',
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({ configStore: staruiTestState.configStore }),
  useUserIdFromContext: () => 'test-user',
}));

vi.mock('@wellsfargo-starui/grid/widgets/hosted', () => ({
  useHostedStarui: ({ defaultGridId }: { defaultGridId: string }) => ({
    gridId: defaultGridId,
    identity: { appId: 'TestApp', userId: 'test-user', storage: () => ({}) },
    ready: true,
  }),
}));

vi.mock('@wellsfargo-starui/grid', () => ({
  DataHubProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'data-hub-provider' }, children),
  StaruiIdentityProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'starui-identity' }, children),
  StarGrid: (props: Record<string, unknown>) => {
    const advanced = (props.advanced ?? {}) as Record<string, unknown>;
    return React.createElement('div', {
      'data-testid': props.title === 'STOMP Positions (SSRM)' ? 'star-grid-ssrm' : 'star-grid',
      'data-grid-id': props.gridId,
      'data-provider-id': props.providerId,
      'data-instance-id': advanced.instanceId,
      'data-historical-provider': advanced.defaultHistoricalProviderId,
      'data-has-inline-cfg': advanced.inlineCfg ? 'true' : 'false',
    });
  },
}));

vi.mock('@wellsfargo-starui/design-system', () => ({
  applyTheme: vi.fn(),
  getTheme: vi.fn(() => ({ theme: 'dark' })),
}));

vi.mock('@wellsfargo-starui/design-system/css', () => ({}));

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'ag-grid-react' }, String(props.rowData ?? 'empty')),
}));
