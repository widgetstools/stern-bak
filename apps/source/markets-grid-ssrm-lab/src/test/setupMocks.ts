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
  DataHubProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'data-hub-provider' }, children),
}));

vi.mock('@wellsfargo-starui/grid/widgets/hosted', () => ({
  HostedSsrmMarketsGrid: (props: Record<string, unknown>) =>
    React.createElement('div', {
      'data-testid': 'hosted-ssrm-markets-grid',
      'data-provider-id': props.providerId,
      'data-title': props.title,
      'data-has-inline-cfg': props.inlineCfg ? 'true' : 'false',
      'data-default-instance-id': props.defaultInstanceId,
      'data-with-storage': props.withStorage ? 'true' : 'false',
      'data-has-config-manager': props.configManager ? 'true' : 'false',
    }),
}));

vi.mock('@wellsfargo-starui/design-system', () => ({
  applyTheme: vi.fn(),
  getTheme: vi.fn(() => ({ theme: 'dark' })),
}));

vi.mock('@wellsfargo-starui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/react')>();
  return {
    ...actual,
    TooltipProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement('button', props, props.children),
  };
});
