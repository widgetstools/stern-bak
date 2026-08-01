import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ProviderConfig } from '@wellsfargo-starui/shared-types';
import { DiagnosticsTab } from './DiagnosticsTab.js';

const attach = vi.fn();
const detach = vi.fn();
const stop = vi.fn();
const useProviderStats = vi.hoisted(() => vi.fn());

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
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

  it('renders live stats and status badges', async () => {
    useProviderStats.mockImplementation((_id, opts) => {
      queueMicrotask(() => {
        opts?.onStats?.({
          rowCount: 1200,
          snapshotFetchMs: 250,
          restartRequestMs: 900,
          firstMessageMs: 1500,
          msgCount: 42,
          msgPerSec: 3.5,
          byteCount: 2048,
          publishCount: 10,
          publishPerSec: 1.2,
          publishPerMin: 72,
          subscriberCount: 2,
          startedAt: Date.now(),
          lastMessageAt: Date.now(),
          errorCount: 1,
          lastError: 'socket reset',
          cacheBytes: 4096,
        });
      });
    });
    attach.mockReturnValue('sub-1');
    render(<DiagnosticsTab providerId="dp-1" cfg={CFG} />);
    expect(await screen.findByText('1,200')).toBeInTheDocument();
    expect(screen.getByText('socket reset')).toBeInTheDocument();
  });

  it('shows status banner errors after restart', () => {
    attach.mockImplementation((_id, _cfg, handlers) => {
      handlers.onStatus('error', 'broker down');
      return 'sub-1';
    });
    render(<DiagnosticsTab providerId="dp-1" cfg={CFG} />);
    fireEvent.click(screen.getByRole('button', { name: /restart/i }));
    expect(screen.getByText('broker down')).toBeInTheDocument();
  });
});
