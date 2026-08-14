/**
 * useGridContextLink — wires a MarketsGrid into OpenFin's colored "Link"
 * groups for grid-to-grid context sharing.
 *
 *   • PUBLISH: broadcasts the grid's selection (key-field values, or the
 *     grouped column id + key for group rows) on the joined FDC3 user
 *     channel whenever the selection changes.
 *   • RECEIVE: listens for link contexts from peer grids and applies them
 *     as a row filter (merging with the user's own column filters).
 *
 * Linking is a flat peer group keyed by color — there is no parent/child
 * or publisher/subscriber hierarchy; every member both broadcasts to and
 * receives from the group. The grid listens on whatever channel the host
 * has linked it to via the Workspace "Link" button (no auto-join).
 *
 * Outside an FDC3 runtime every operation is a no-op (the underlying
 * `useFdc3Channel` degrades gracefully), so this is safe to mount in
 * non-OpenFin hosts.
 */

import { useEffect, useRef } from 'react';
import type { GridApi } from 'ag-grid-community';
import { getOpenFinWindowIdentity } from '@wellsfargo-starui/openfin/host';
import type { UseFdc3ChannelResult } from './useFdc3Channel.js';
import {
  GRID_LINK_CONTEXT_TYPE,
  applyGridLinkContext,
  applyRowIdExternalFilter,
  buildRowIdContext,
  buildSelectionContext,
  defaultGridLinkResolver,
  normalizeRowIdField,
  type GridLinkResolver,
  type GridLinkSelectionBuilder,
  type GridLinkSelectionContext,
} from './gridContextLink.js';

export interface GridContextLinkConfig {
  /** Master switch. Linking is inactive unless this is `true`. */
  enabled?: boolean;
  /**
   * What a selected row contributes to the broadcast:
   *  - `'rowId'` (default): the row id from AG-Grid's `getRowId`
   *    (`composeRowId` over the data provider's key fields). Peers apply
   *    it as an external filter that keeps only those rows. Needs no
   *    `rowIdField` config — the provider already drives `getRowId`.
   *  - `'fields'`: the row's `rowIdField` values, applied by peers as a
   *    per-column set-filter. Use when peers key rows differently and
   *    you want to match on shared business fields.
   */
  mode?: 'rowId' | 'fields';
  /** Broadcast this grid's selection to linked peers. Default `true`. */
  publish?: boolean;
  /** Apply incoming linked contexts to the grid. Default `true`. */
  receive?: boolean;
  /**
   * `mode: 'fields'` only — row key field(s) describing a selected leaf
   * row. Set to the provider's `keyColumn` so peers match on the same
   * fields. Defaults to `'id'`. Ignored in `'rowId'` mode.
   */
  rowIdField?: string | readonly string[];
  /** Override the receive-side context → filter-model mapping (`'fields'` mode). */
  resolve?: GridLinkResolver;
  /** Override the publish-side selection → context mapping. */
  buildContext?: GridLinkSelectionBuilder;
  /** FDC3 context type for link messages. Defaults to `'starui.gridSelection'`. */
  contextType?: string;
  /**
   * Post OpenFin Notification Center messages for link traffic: a "sent"
   * notification when this grid broadcasts a selection, and an
   * acknowledgement when it receives a peer's. Wired by the host via the
   * `onPublish` / `onReceive` callbacks (see {@link useGridLinkNotifications}).
   * No-op outside an OpenFin runtime. Default `false`.
   */
  notify?: boolean;
  /**
   * Emit verbose link diagnostics to the console (`[gridLink] publish` /
   * `[gridLink] receive`, `[interop] setContext ok`, "not in a context group"
   * notices). Off by default — turn on while wiring up / debugging color
   * linking. Genuine error warnings are always logged regardless.
   */
  debug?: boolean;
}

export interface UseGridContextLinkArgs {
  /** Live AG-Grid API, or `null` until the grid is ready. */
  gridApi: GridApi | null;
  /** FDC3 channel facade from `useFdc3Channel` / `useHostedView().linking.fdc3`. */
  fdc3: UseFdc3ChannelResult;
  /** This view's instance id — broadcast as `source` so we ignore our own echo. */
  instanceId: string;
  /** Linking config; when omitted or `enabled !== true`, the hook does nothing. */
  config?: GridContextLinkConfig;
  /** Invoked right after this grid broadcasts a selection context to peers. */
  onPublish?: (context: GridLinkSelectionContext) => void;
  /** Invoked right after a peer's selection context is received + applied. */
  onReceive?: (context: GridLinkSelectionContext) => void;
}

/**
 * A source id unique PER WINDOW, used for echo suppression. The app
 * `instanceId` is NOT safe here: two instances of the same view share it, so
 * each would discard the other's broadcast as its own echo (the classic "two
 * linked grids never see each other" bug). Prefer the OpenFin window identity
 * (`uuid/name`, unique per view); fall back to `instanceId` + a random suffix
 * outside OpenFin so duplicate views still get distinct sources.
 */
function makeSourceId(instanceId: string): string {
  try {
    const id = getOpenFinWindowIdentity();
    if (id?.name) return id.uuid ? `${id.uuid}/${id.name}` : id.name;
  } catch {
    /* not OpenFin */
  }
  return `${instanceId}::${Math.random().toString(36).slice(2, 10)}`;
}

export function useGridContextLink({
  gridApi,
  fdc3,
  instanceId,
  config,
  onPublish,
  onReceive,
}: UseGridContextLinkArgs): void {
  const active = Boolean(config) && config?.enabled === true;
  const contextType = config?.contextType ?? GRID_LINK_CONTEXT_TYPE;
  const mode = config?.mode ?? 'rowId';

  // Per-window source id (see makeSourceId). Stable for the hook's lifetime.
  const sourceIdRef = useRef<string>('');
  if (!sourceIdRef.current) sourceIdRef.current = makeSourceId(instanceId);
  const sourceId = sourceIdRef.current;

  // Fields the most recent received context filtered on — so the next
  // context only clears the columns this link owns, not the user's.
  const linkFieldsRef = useRef<readonly string[]>([]);
  // True while we apply a received context, so the resulting
  // selection/filter churn doesn't echo straight back out.
  const applyingRemoteRef = useRef(false);
  /** Monotonic publish sequence — a build that finishes late is discarded. */
  const publishSeqRef = useRef(0);

  // Ref-bridge the notify callbacks so changing their identity doesn't
  // re-attach the grid / fdc3 listeners below.
  const onPublishRef = useRef(onPublish);
  const onReceiveRef = useRef(onReceive);
  onPublishRef.current = onPublish;
  onReceiveRef.current = onReceive;

  // Latest joined channel, read fresh at selection time (the publish effect
  // doesn't re-run on channel change, so reading a captured `fdc3.current`
  // would go stale).
  const channelRef = useRef<string | null>(fdc3.current);
  channelRef.current = fdc3.current;

  // Verbose diagnostics gate (off by default). Ref-bridged so toggling it
  // doesn't re-attach the listeners below.
  const debugRef = useRef(false);
  debugRef.current = config?.debug === true;

  const { addContextListener } = fdc3;
  const resolve = config?.resolve ?? defaultGridLinkResolver;
  const receive = config?.receive !== false;

  // ── RECEIVE ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !receive || !gridApi) return;
    const detach = addContextListener(contextType, (ctx) => {
      const context = ctx as GridLinkSelectionContext;
      const isEcho = Boolean(context.source) && context.source === sourceId;
      if (debugRef.current) {
        // eslint-disable-next-line no-console
        console.debug('[gridLink] receive', {
          self: sourceId,
          from: context.source,
          channel: context.channel ?? null,
          isEcho,
          context,
        });
      }
      if (isEcho) return;
      applyingRemoteRef.current = true;
      try {
        // In rowId mode a caller-supplied resolver (e.g. SSRM's set-filter
        // translation — SSRM never invokes doesExternalFilterPass) routes
        // through the merging filter path; without one, the external-filter
        // default is byte-for-byte the pre-existing behaviour.
        if (mode === 'rowId' && resolve === defaultGridLinkResolver) {
          applyRowIdExternalFilter(gridApi, context);
        } else {
          linkFieldsRef.current = applyGridLinkContext(
            gridApi,
            context,
            resolve,
            linkFieldsRef.current,
          );
        }
        // Notify after applying so the ack reflects a received-and-handled
        // context (e.g. an OpenFin Notification Center acknowledgement).
        onReceiveRef.current?.(context);
      } finally {
        // Release after the filter/selection events have flushed.
        queueMicrotask(() => {
          applyingRemoteRef.current = false;
        });
      }
    });
    return detach;
  }, [active, receive, gridApi, addContextListener, contextType, instanceId, resolve, mode]);

  const { broadcast } = fdc3;
  const build =
    config?.buildContext ?? (mode === 'rowId' ? buildRowIdContext : buildSelectionContext);
  const publish = config?.publish !== false;
  const rowIdField = config?.rowIdField;

  // ── PUBLISH ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !publish || !gridApi) return;
    const fields = normalizeRowIdField(rowIdField);
    const publishContext = (context: GridLinkSelectionContext) => {
      context.type = contextType;
      // Stamp the joined channel so peers + notifications can show it. A
      // `null` channel here is the #1 reason peers receive nothing — the
      // window isn't on an FDC3 user channel despite the color "Link".
      context.channel = channelRef.current ?? undefined;
      if (debugRef.current) {
        // eslint-disable-next-line no-console
        console.debug('[gridLink] publish', {
          self: sourceId,
          channel: channelRef.current ?? null,
          context,
        });
      }
      void broadcast(context);
      onPublishRef.current?.(context);
    };

    const onSelectionChanged = () => {
      if (applyingRemoteRef.current) return;
      const seq = ++publishSeqRef.current;
      let result: ReturnType<typeof build>;
      try {
        result = build(gridApi, { instanceId: sourceId, rowIdField: fields });
      } catch {
        return; // a failed build publishes nothing; the next selection retries
      }
      // Sync builders (CSRM) publish synchronously — identical to the
      // pre-awaitable behaviour. Only promise-returning builders (SSRM
      // worker round-trips) take the guarded async path.
      if (!(result instanceof Promise)) {
        if (result) publishContext(result);
        return;
      }
      void result
        .then((context) => {
          // A newer selection superseded this build while it was in flight.
          if (seq !== publishSeqRef.current) return;
          if (!context) return;
          publishContext(context);
        })
        .catch(() => {
          /* failed async build publishes nothing; next selection retries */
        });
    };
    gridApi.addEventListener('selectionChanged', onSelectionChanged);
    return () => {
      try {
        gridApi.removeEventListener('selectionChanged', onSelectionChanged);
      } catch {
        /* grid already destroyed */
      }
    };
  }, [active, publish, gridApi, broadcast, build, contextType, instanceId, rowIdField]);
}
