import type { MarketsGridEventHandlerRegistry } from '@wellsfargo-starui/grid';

export const gridEventHandlers: MarketsGridEventHandlerRegistry = {
  'log-profile-saved': (payload) => {
    // eslint-disable-next-line no-console
    console.log('[stomp-blotter] profile saved', payload);
  },
  'alert-provider-error': (payload, ctx) => {
    const statusPayload = payload as { status?: string; error?: string; providerId?: string | null };
    if (statusPayload.status !== 'error' && !statusPayload.error) return;
    // eslint-disable-next-line no-console
    console.warn(
      `[stomp-blotter] provider error grid=${ctx.gridId} provider=${statusPayload.providerId ?? '—'}:`,
      statusPayload.error ?? statusPayload.status,
    );
  },
};
