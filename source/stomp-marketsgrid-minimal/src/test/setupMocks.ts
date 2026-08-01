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

vi.mock('@wellsfargo-starui/host-data', () => ({
  ensurePlatformReady: (...args: unknown[]) => staruiTestState.ensurePlatformReady(...args),
  resolvePlatformBootstrapFromJson: (...args: unknown[]) =>
    staruiTestState.resolvePlatformBootstrapFromJson(...args),
}));

vi.mock('@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url', () => ({
  default: '/mock-worker.mjs',
}));

vi.mock('@wellsfargo-starui/host-data-react/runtime', () => ({
  useDataServices: () => ({ configStore: staruiTestState.configStore }),
  useUserIdFromContext: () => 'test-user',
  DataHubProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'data-hub-provider' }, children),
}));

vi.mock('@wellsfargo-starui/widgets-react/hosted', () => ({
  HostedMarketsGrid: (props: Record<string, unknown>) =>
    React.createElement('div', {
      'data-testid': 'hosted-markets-grid',
      'data-grid-id': props.gridId,
      'data-live-provider': props.defaultLiveProviderId,
      'data-historical-provider': props.defaultHistoricalProviderId,
    }),
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
