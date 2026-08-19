import { describe, expect, it, vi } from 'vitest';
import type { MarketsGridEventContext } from '@wellsfargo-starui/grid/core';
import { gridEventHandlers } from './gridEventHandlers.js';

/** The handlers under test only read ctx.gridId — a partial mock is the point. */
const makeCtx = (gridId: string): MarketsGridEventContext =>
  ({ gridId } satisfies Partial<MarketsGridEventContext>) as MarketsGridEventContext;

describe('gridEventHandlers', () => {
  it('logs profile saved payloads', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const payload = { profileId: 'default' };

    gridEventHandlers['log-profile-saved']?.(payload, makeCtx('stomp-blotter'));

    expect(logSpy).toHaveBeenCalledWith('[stomp-blotter] profile saved', payload);
    logSpy.mockRestore();
  });

  it('warns on provider error status', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx('stomp-blotter');

    gridEventHandlers['alert-provider-error']?.(
      { status: 'error', error: 'connection refused', providerId: 'provider-1' },
      ctx,
    );

    expect(warnSpy).toHaveBeenCalledWith(
      '[stomp-blotter] provider error grid=stomp-blotter provider=provider-1:',
      'connection refused',
    );
    warnSpy.mockRestore();
  });

  it('warns when only error field is present', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    gridEventHandlers['alert-provider-error']?.({ error: 'timeout' }, makeCtx('grid-1'));

    expect(warnSpy).toHaveBeenCalledWith(
      '[stomp-blotter] provider error grid=grid-1 provider=—:',
      'timeout',
    );
    warnSpy.mockRestore();
  });

  it('falls back to status text when error field is absent', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    gridEventHandlers['alert-provider-error']?.({ status: 'error' }, makeCtx('grid-1'));

    expect(warnSpy).toHaveBeenCalledWith(
      '[stomp-blotter] provider error grid=grid-1 provider=—:',
      'error',
    );
    warnSpy.mockRestore();
  });
});
