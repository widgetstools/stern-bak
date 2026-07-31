import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ProviderConfig } from '@wellsfargo-starui/shared-types';
import { DiagnosticsTab } from './DiagnosticsTab.js';

const attach = vi.fn();
const detach = vi.fn();
const stop = vi.fn();

vi.mock('@wellsfargo-starui/host-data-react/runtime', () => ({
  useDataServices: () => ({
    client: { attach, detach, stop },
  }),
  useProviderStats: () => undefined,
}));

const CFG = {
  providerType: 'stomp',
  websocketUrl: 'ws://localhost:8080/ws',
  listenerTopic: '/topic/positions',
  requestMessage: '/app/positions',
  keyColumn: 'id',
} as ProviderConfig;

describe('DiagnosticsTab', () => {
  beforeEach(() => {
    attach.mockReset();
    detach.mockReset();
    stop.mockReset();
  });

  it('starts a cold provider restart with the saved provider config', () => {
    attach.mockReturnValue('sub-1');

    render(
      <DiagnosticsTab
        providerId="dp-1"
        cfg={CFG}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /restart/i }));

    expect(attach).toHaveBeenCalledWith(
      'dp-1',
      CFG,
      expect.objectContaining({
        onDelta: expect.any(Function),
        onStatus: expect.any(Function),
      }),
      { extra: expect.objectContaining({ __refresh: expect.any(Number) }) },
    );
  });
});
