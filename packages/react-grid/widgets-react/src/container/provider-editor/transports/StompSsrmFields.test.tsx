import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StompSsrmProviderConfig } from '@wellsfargo-starui/types/shared';
import { STOMP_TUNING_DEFAULTS } from '@wellsfargo-starui/types/shared';
import { StompSsrmFields } from './StompSsrmFields.js';

const base = {
  providerType: 'stomp-ssrm',
  websocketUrl: 'ws://localhost:8080',
  listenerTopic: '/topic/a',
} as unknown as StompSsrmProviderConfig;

/** The two SSRM-only numeric inputs, by the label sitting above each. */
function ssrmInputs() {
  const numbers = screen.getAllByRole('spinbutton');
  return { blockSize: numbers[0], publishWindow: numbers[1] };
}

describe('StompSsrmFields', () => {
  it('renders the shared STOMP connection fields alongside the SSRM section', () => {
    render(<StompSsrmFields cfg={base} onChange={vi.fn()} />);

    expect(screen.getByPlaceholderText('/snapshot/positions/TRADER001')).toBeInTheDocument();
    expect(screen.getByText('SSRM')).toBeInTheDocument();
    expect(screen.getByText('Cache block size')).toBeInTheDocument();
    expect(screen.getByText('Publish window (ms)')).toBeInTheDocument();
  });

  it('shows defaults when the config carries neither tuning value', () => {
    render(<StompSsrmFields cfg={base} onChange={vi.fn()} />);
    const { blockSize, publishWindow } = ssrmInputs();

    expect(blockSize).toHaveValue(100);
    expect(publishWindow).toHaveValue(STOMP_TUNING_DEFAULTS.publishWindowMs);
  });

  it('shows the configured values when the config carries them', () => {
    render(
      <StompSsrmFields
        cfg={{ ...base, blockSize: 500, publishWindowMs: 250 } as StompSsrmProviderConfig}
        onChange={vi.fn()}
      />,
    );
    const { blockSize, publishWindow } = ssrmInputs();

    expect(blockSize).toHaveValue(500);
    expect(publishWindow).toHaveValue(250);
  });

  it('forwards a typed block size', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StompSsrmFields cfg={base} onChange={onChange} />);

    await user.type(ssrmInputs().blockSize, '2');
    expect(onChange).toHaveBeenLastCalledWith({ blockSize: 1002 });
  });

  it('floors a block size at the smallest page worth requesting', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StompSsrmFields
        cfg={{ ...base, blockSize: 0 } as StompSsrmProviderConfig}
        onChange={onChange}
      />,
    );

    await user.type(ssrmInputs().blockSize, '5');
    expect(onChange).toHaveBeenLastCalledWith({ blockSize: 20 });
  });

  it('falls back to the default block size when the field is cleared', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StompSsrmFields cfg={base} onChange={onChange} />);

    await user.clear(ssrmInputs().blockSize);
    expect(onChange).toHaveBeenLastCalledWith({ blockSize: 100 });
  });

  it('forwards a positive publish window', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StompSsrmFields
        cfg={{ ...base, publishWindowMs: 20 } as StompSsrmProviderConfig}
        onChange={onChange}
      />,
    );

    await user.type(ssrmInputs().publishWindow, '0');
    expect(onChange).toHaveBeenLastCalledWith({ publishWindowMs: 200 });
  });

  it('clears the publish window rather than storing a zero', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StompSsrmFields
        cfg={{ ...base, publishWindowMs: 250 } as StompSsrmProviderConfig}
        onChange={onChange}
      />,
    );

    // Unset and 0 mean the same thing to the worker — flush per tick — so the
    // config should carry the absence, not a magic zero.
    await user.clear(ssrmInputs().publishWindow);
    expect(onChange).toHaveBeenLastCalledWith({ publishWindowMs: undefined });
  });
});
