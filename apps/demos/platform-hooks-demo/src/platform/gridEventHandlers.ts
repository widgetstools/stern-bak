import type { MarketsGridEventHandlerRegistry } from '@wellsfargo-starui/grid';
import { appendDemoEventLog } from '../state/eventLogStore.js';

function payloadPreview(payload: unknown): string {
  if (payload == null) return '(empty)';
  try {
    const text = JSON.stringify(payload);
    return text.length > 140 ? `${text.slice(0, 137)}…` : text;
  } catch {
    return String(payload);
  }
}

function log(
  handlerId: string,
  summary: string,
  payload: unknown = undefined,
): void {
  appendDemoEventLog({ handlerId, summary, payload });
}

/**
 * Handler registry — only ids are persisted in gridLevelData.eventBindings.
 * Bind handlers to events in Custom Settings → EVENT CALLBACKS.
 */
export const gridEventHandlers: MarketsGridEventHandlerRegistry = {
  'log-grid-ready': (_payload, ctx) => {
    log('log-grid-ready', `Grid ready on ${ctx.gridId}`, _payload);
  },

  'log-grid-destroyed': (_payload, ctx) => {
    log('log-grid-destroyed', `Grid destroyed on ${ctx.gridId}`, _payload);
  },

  'log-profile-loaded': (payload, ctx) => {
    const p = payload as { profileId?: string };
    log(
      'log-profile-loaded',
      `Profile loaded (${p.profileId ?? '?'}) on grid ${ctx.gridId}`,
      payload,
    );
  },

  'log-profile-saved': (payload, ctx) => {
    const p = payload as { profileId?: string; gridId?: string };
    log(
      'log-profile-saved',
      `Profile saved (${p.profileId ?? '?'}) on grid ${ctx.gridId}`,
      payload,
    );
  },

  'log-profile-deleted': (payload, ctx) => {
    const p = payload as { profileId?: string };
    log(
      'log-profile-deleted',
      `Profile deleted (${p.profileId ?? '?'}) on grid ${ctx.gridId}`,
      payload,
    );
  },

  'log-provider-status': (payload) => {
    const p = payload as { status?: string; error?: string; providerId?: string | null; mode?: string };
    log(
      'log-provider-status',
      `Provider ${p.providerId ?? '—'} → ${p.status ?? '?'} (${p.mode ?? '?'})${p.error ? `: ${p.error}` : ''}`,
      payload,
    );
  },

  'log-provider-switched': (payload) => {
    const p = payload as { mode?: string; liveProviderId?: string | null; historicalProviderId?: string | null };
    log(
      'log-provider-switched',
      `Mode=${p.mode ?? '?'} live=${p.liveProviderId ?? '—'} hist=${p.historicalProviderId ?? '—'}`,
      payload,
    );
  },

  'log-data-stale': (payload) => {
    const p = payload as { stale?: boolean; message?: string };
    log(
      'log-data-stale',
      p.stale ? `Stale: ${p.message ?? 'yes'}` : 'Data fresh again',
      payload,
    );
  },

  'log-toolbar-date': (payload) => {
    const p = payload as { date?: string; historical?: boolean };
    log(
      'log-toolbar-date',
      `Toolbar date ${p.date ?? '?'} (historical=${Boolean(p.historical)})`,
      payload,
    );
  },

  'log-first-data-rendered': (_payload, ctx) => {
    log('log-first-data-rendered', `First data rendered on grid ${ctx.gridId}`, _payload);
  },

  'log-row-data-updated': (_payload, ctx) => {
    log('log-row-data-updated', `Row data updated on grid ${ctx.gridId}`, payloadPreview(_payload));
  },

  'log-cell-clicked': (_payload, ctx) => {
    log('log-cell-clicked', `Cell clicked on grid ${ctx.gridId}`, payloadPreview(_payload));
  },

  'log-cell-value-changed': (_payload, ctx) => {
    log('log-cell-value-changed', `Cell value changed on grid ${ctx.gridId}`, payloadPreview(_payload));
  },

  'log-filter-changed': (_payload, ctx) => {
    log('log-filter-changed', `Filter model changed on grid ${ctx.gridId}`, payloadPreview(_payload));
  },
};
