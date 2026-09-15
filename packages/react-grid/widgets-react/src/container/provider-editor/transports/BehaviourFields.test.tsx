import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BehaviourFields } from './BehaviourFields.js';

afterEach(() => {
  cleanup();
});

describe('BehaviourFields', () => {
  it('shows only the start-up switch for transports without behaviour knobs', () => {
    render(
      <BehaviourFields
        cfg={{ providerType: 'rest', baseUrl: 'https://x', endpoint: '/a', method: 'GET' }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('switch', { name: /Start with the platform/i })).not.toBeChecked();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByText(/Thin field-level deltas/i)).toBeNull();
  });

  it('toggles autoStart on (true) and off (unset) for any transport', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { unmount } = render(
      <BehaviourFields
        cfg={{ providerType: 'stomp-ssrm', websocketUrl: 'ws://x', listenerTopic: '/t', snapshotEndToken: 'Success', requestBody: '' }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('switch', { name: /Start with the platform/i }));
    expect(onChange).toHaveBeenLastCalledWith({ autoStart: true });
    unmount();
    render(
      <BehaviourFields
        cfg={{ providerType: 'mock', dataType: 'positions', autoStart: true }}
        onChange={onChange}
      />,
    );
    const on = screen.getByRole('switch', { name: /Start with the platform/i });
    expect(on).toBeChecked();
    await user.click(on);
    expect(onChange).toHaveBeenLastCalledWith({ autoStart: undefined });
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

  it('derives conflate options from inferred fields when column defs are absent', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <BehaviourFields
        cfg={{
          providerType: 'stomp',
          websocketUrl: 'ws://x',
          listenerTopic: '/t',
          inferredFields: [{ path: 'symbol', label: 'symbol', type: 'string' }],
        }}
        onChange={onChange}
      />,
    );
    const conflateCombo = screen.getByText('Conflate by key').parentElement!.querySelector('[role=combobox]') as HTMLElement;
    await user.click(conflateCombo);
    await user.click(await screen.findByRole('option', { name: 'symbol' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ conflateByKey: 'symbol' }));
  });

  it('updates throttle and snapshot chunk size inputs', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <BehaviourFields
        cfg={{
          providerType: 'stomp',
          websocketUrl: 'ws://x',
          listenerTopic: '/t',
          throttleMs: 100,
          snapshotChunkSize: 250,
        }}
        onChange={onChange}
      />,
    );
    const spinners = screen.getAllByRole('spinbutton');
    await user.clear(spinners.at(-2)!);
    await user.type(spinners.at(-2)!, '50');
    await user.clear(spinners.at(-1)!);
    await user.type(spinners.at(-1)!, '100');
    expect(onChange).toHaveBeenCalled();
  });

});

/**
 * `stomp` and `stomp-ssrm` are ONE transport — `registry.ts` maps both to
 * `startStomp` and nothing in it branches on `providerType` — so every ingest
 * knob acts on both, just upstream of a different consumer. The SSRM tab used
 * to offer Reconnect alone, on the mistaken grounds that the rest was
 * CSRM-only; these pin which knobs each mode gets so the two cannot drift
 * apart again.
 */
describe('BehaviourFields — stomp-ssrm', () => {
  const ssrmCfg = {
    providerType: 'stomp-ssrm' as const,
    websocketUrl: 'ws://x',
    listenerTopic: '/t',
    snapshotEndToken: 'Success',
    requestBody: '',
    keyColumn: 'positionId',
    columnDefinitions: [
      { field: 'positionId', headerName: 'Id' },
      { field: 'px', headerName: 'Px' },
    ],
  };

  const renderSsrm = (onChange = vi.fn()) => {
    render(<BehaviourFields cfg={ssrmCfg as never} onChange={onChange} />);
    return onChange;
  };

  it('offers the ingest knobs that the shared transport honours', () => {
    renderSsrm();
    expect(screen.getByText(/^Reconnect$/i)).toBeInTheDocument();
    expect(screen.getByText(/Throttle updates/i)).toBeInTheDocument();
    expect(screen.getByText(/Conflate updates/i)).toBeInTheDocument();
    expect(screen.getByText(/Chunk size/i)).toBeInTheDocument();
    expect(screen.getByText(/Keep only column fields/i)).toBeInTheDocument();
  });

  it('omits the two knobs that only shape the worker→client row broadcast', () => {
    renderSsrm();
    // An SSRM grid pulls blocks; it never receives the row broadcast these
    // two govern, so offering them would be a control that does nothing.
    // Asserted on the CONTROLS, not the prose — the footnote below names
    // both knobs to say why they are absent.
    expect(screen.queryByLabelText(/Thin field-level deltas/i)).toBeNull();
    expect(screen.queryByLabelText(/Wire format/i)).toBeNull();
    expect(screen.getByText(/pulls blocks instead of receiving it/i)).toBeInTheDocument();
  });

  it('writes the throttle window', async () => {
    const user = userEvent.setup();
    const onChange = renderSsrm();
    const throttle = screen.getByLabelText(/Throttle \(ms\)/i);
    await user.clear(throttle);
    await user.type(throttle, '250');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ throttleMs: expect.any(Number) }));
  });

  it('writes the conflation key from the provider\'s own columns', async () => {
    const user = userEvent.setup();
    const onChange = renderSsrm();
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'px' }));
    expect(onChange).toHaveBeenCalledWith({ conflateByKey: 'px' });
  });

  it('writes the master switches and field projection', async () => {
    const user = userEvent.setup();
    const onChange = renderSsrm();

    await user.click(screen.getByLabelText(/Throttle updates/i));
    expect(onChange).toHaveBeenCalledWith({ throttleEnabled: false });

    await user.click(screen.getByLabelText(/Conflate updates/i));
    expect(onChange).toHaveBeenCalledWith({ conflateEnabled: false });

    await user.click(screen.getByLabelText(/Keep only column fields/i));
    expect(onChange).toHaveBeenCalledWith({ projectFields: true });
  });

  it('still writes the reconnect delay', async () => {
    const user = userEvent.setup();
    const onChange = renderSsrm();
    const delay = screen.getByLabelText(/Initial Delay/i);
    await user.clear(delay);
    await user.type(delay, '2500');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ reconnect: expect.objectContaining({ initialDelayMs: expect.any(Number) }) }),
    );
  });

  it('keeps the CSRM tab complete — both modes share the section components', () => {
    render(<BehaviourFields cfg={{ ...ssrmCfg, providerType: 'stomp' } as never} onChange={vi.fn()} />);
    for (const label of [
      /Throttle updates/i, /Thin field-level deltas/i, /Conflate updates/i,
      /Chunk size/i, /Wire format/i, /Keep only column fields/i,
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});