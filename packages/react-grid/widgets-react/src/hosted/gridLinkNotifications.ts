/**
 * gridLinkNotifications — pure helpers that turn a grid-link selection
 * context (see {@link GridLinkSelectionContext}) into Notification Center
 * content.
 *
 * Two shapes:
 *   - PUBLISH side: when this grid's selection is broadcast to color-linked
 *     peers, post "Linked selection sent — <keyColumn> = <value>".
 *   - RECEIVE side: when a peer's selection arrives, post an acknowledgement
 *     "Linked selection received — acknowledged <keyColumn> = <value> from
 *     <peer>".
 *
 * A "selection cleared" context (empty `criteria` / no `rowIds`) yields
 * `null` so deselecting doesn't spam the notification centre or emit a
 * meaningless ack.
 *
 * Framework-free + side-effect-free so they unit-test without an OpenFin
 * runtime; the dispatch wiring lives in `useGridLinkNotifications`.
 */

import type { GridLinkSelectionContext } from './gridContextLink.js';

/** The transferable subset of an OpenFin notification this module produces. */
export interface GridLinkNotificationContent {
  title: string;
  /** Markdown body (host-openfin dispatches with `template: 'markdown'`). */
  body: string;
  /** OpenFin notification category id. */
  category: string;
  customData?: Record<string, unknown>;
}

/**
 * Render a fields-mode `criteria` map as a human "field = value" string.
 * A single value reads `field = value`; multiple values read
 * `field ∈ {a, b}`; multiple fields join with ` · `.
 */
/** Max values shown per field in the notification body (the full set still
 *  rides in the payload + customData — this only trims the human summary so a
 *  whole-group selection doesn't produce a giant toast). */
const MAX_SHOWN = 5;

export function summarizeCriteria(criteria: Record<string, unknown[]> | undefined): string {
  if (!criteria) return '';
  const parts: string[] = [];
  for (const [field, values] of Object.entries(criteria)) {
    if (!Array.isArray(values) || values.length === 0) continue;
    const vals = values.map((v) => String(v));
    if (vals.length === 1) {
      parts.push(`${field} = ${vals[0]}`);
      continue;
    }
    const shown = vals.slice(0, MAX_SHOWN).join(', ');
    parts.push(
      vals.length > MAX_SHOWN
        ? `${field} ∈ {${shown}, +${vals.length - MAX_SHOWN} more} (${vals.length})`
        : `${field} ∈ {${shown}}`,
    );
  }
  return parts.join(' · ');
}

/** Render a rowId-mode payload (the composed key values) compactly. */
function summarizeRowIds(rowIds: readonly string[] | undefined): string {
  if (!rowIds || rowIds.length === 0) return '';
  if (rowIds.length === 1) return rowIds[0];
  const head = rowIds.slice(0, 3).join(', ');
  return `${rowIds.length} rows (${head}${rowIds.length > 3 ? ', …' : ''})`;
}

/** Best available human summary of a link context (criteria wins over rowIds). */
export function summarizeLinkContext(context: GridLinkSelectionContext): string {
  return summarizeCriteria(context.criteria) || summarizeRowIds(context.rowIds);
}

/** Render the channel the context rode on — or a loud "(no channel)" when the
 *  publisher wasn't joined to one (the usual cause of peers receiving nothing). */
function channelTag(context: GridLinkSelectionContext): string {
  return context.channel ? `\`${context.channel}\`` : '_(no channel — peers won\'t receive)_';
}

/**
 * Publisher-side notification: this grid broadcast its selected row's key
 * column + value to linked peers. `null` when the selection is empty.
 */
export function buildSelectionNotification(
  context: GridLinkSelectionContext,
): GridLinkNotificationContent | null {
  const summary = summarizeLinkContext(context);
  if (!summary) return null;
  return {
    title: 'Linked selection sent',
    body: `Broadcast **${summary}** to color-linked grids on channel ${channelTag(context)}.`,
    category: 'info',
    customData: {
      kind: 'gridLink.selection',
      source: context.source,
      channel: context.channel,
      criteria: context.criteria,
      rowIds: context.rowIds,
    },
  };
}

/**
 * Receiver-side acknowledgement: this grid received a peer's selection.
 * `null` when the incoming selection is empty (cleared).
 */
export function buildAckNotification(
  context: GridLinkSelectionContext,
  opts: { instanceId: string },
): GridLinkNotificationContent | null {
  const summary = summarizeLinkContext(context);
  if (!summary) return null;
  const from = context.source ? `\`${context.source}\`` : 'a linked grid';
  return {
    title: 'Linked selection received',
    body: `Acknowledged **${summary}** from ${from} on channel ${channelTag(context)}.`,
    category: 'info',
    customData: {
      kind: 'gridLink.ack',
      from: context.source,
      to: opts.instanceId,
      channel: context.channel,
      criteria: context.criteria,
      rowIds: context.rowIds,
    },
  };
}
