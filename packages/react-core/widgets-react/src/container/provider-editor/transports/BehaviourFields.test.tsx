import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BehaviourFields } from './BehaviourFields.js';

afterEach(() => {
  cleanup();
});

describe('BehaviourFields', () => {
  it('shows a no-settings message for non-stomp transports', () => {
    render(
      <BehaviourFields
        cfg={{ providerType: 'rest', baseUrl: 'https://x', endpoint: '/a' }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/No behaviour settings for REST/)).toBeInTheDocument();
  });

  it('updates stomp reconnect delay', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <BehaviourFields
        cfg={{
          providerType: 'stomp',
          websocketUrl: 'ws://x',
          listenerTopic: '/t',
          reconnect: { initialDelayMs: 5000 },
        }}
        onChange={onChange}
      />,
    );
    const delay = screen.getAllByRole('spinbutton')[0]!;
    await user.clear(delay);
    await user.type(delay, '1000');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ reconnect: expect.objectContaining({ initialDelayMs: expect.any(Number) }) }),
    );
  });

  it('toggles additional stomp behaviour switches and wire format', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <BehaviourFields
        cfg={{
          providerType: 'stomp',
          websocketUrl: 'ws://x',
          listenerTopic: '/t',
          columnDefinitions: [{ field: 'id', headerName: 'Id', cellDataType: 'text' }],
        }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('switch', { name: /Thin field-level deltas/i }));
    await user.click(screen.getByRole('switch', { name: /Conflate updates/i }));
    await user.click(screen.getByRole('switch', { name: /Keep only column fields/i }));
    const wireCombo = screen.getAllByRole('combobox').find((c) => c.textContent?.includes('JSON'))!;
    await user.click(wireCombo);
    await user.click(await screen.findByRole('option', { name: /Columnar/i }));
    expect(onChange).toHaveBeenCalled();
  });
});
