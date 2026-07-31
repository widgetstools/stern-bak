import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ProviderConfig } from '@wellsfargo-starui/shared-types';
import { DiagnosticsTab } from './DiagnosticsTab.js';

const attach = vi.fn();
const detach = vi.fn();
const stop = vi.fn();
const useProviderStats = vi.hoisted(() => vi.fn());

vi.mock('@wellsfargo-starui/host-data-react/runtime', () => ({
  useDataServices: () => ({
    client: { attach, detach, stop },
  }),
  useProviderStats,
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
    useProviderStats.mockImplementation(() => undefined);
  });

  it('prompts to save before diagnostics are available', () => {
    render(<DiagnosticsTab providerId={null} cfg={CFG} />);
    expect(screen.getByText(/Save the provider first/i)).toBeInTheDocument();
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

  it('stops the provider', () => {
    vi.useFakeTimers();
    attach.mockReturnValue('sub-1');
    render(<DiagnosticsTab providerId="dp-1" cfg={CFG} />);
    fireEvent.click(screen.getByRole('button', { name: /Stop/i }));
    expect(stop).toHaveBeenCalledWith('dp-1');
    vi.advanceTimersByTime(800);
    vi.useRealTimers();
  });
});
