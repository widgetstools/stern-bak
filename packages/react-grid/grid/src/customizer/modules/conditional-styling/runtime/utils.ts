/**
 * Pure helpers shared across the conditional-styling runtime modules.
 * Everything here is side-effect-free (the `traceTimed` console.log is
 * gated by an opt-in global flag) and has zero coupling to the platform
 * handle — these are the lowest-level building blocks the runtime layers
 * compose on top of.
 */

const TRACE_PREFIX = '[conditional-styling:timed]';

/**
 * Compose the AG-Grid `columns` context that user expressions evaluate
 * against. The base is `data` itself (so `[colId]` lookups resolve via
 * the prototype chain to row values), with `.old` / `.new` own-properties
 * layered on top for diff-driven expressions like `[price.old] < [price.new]`.
 *
 * Own-property writes for the diff entries are critical: writing them on
 * a fresh object would lose the `data` prototype chain (so plain column
 * reads would return undefined); writing them on `data` directly would
 * pollute the row. `Object.create(data)` gives the right blend.
 */
export function buildColumnsContextFromDiffs(
  data: Record<string, unknown>,
  rowDiffs: Map<string, { oldValue: unknown; newValue: unknown }> | undefined,
): Record<string, unknown> {
  const out = Object.create(data) as Record<string, unknown>;
  if (!rowDiffs || rowDiffs.size === 0) return out;
  for (const [colId, diff] of rowDiffs) {
    out[`${colId}.old`] = diff.oldValue;
    out[`${colId}.new`] = diff.newValue;
  }
  return out;
}

/**
 * Normalise an `activeDurationMs` value off a rule. Returns the rounded
 * positive integer or `null` if the input is undefined / non-finite / ≤0.
 * Drives whether a rule participates in the timed-activation subsystem.
 */
export function normalizeDuration(value: number | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value as number);
  return rounded > 0 ? rounded : null;
}

/**
 * Pull a stable row identifier off an AG-Grid row node. Returns `null`
 * if the node is missing or carries no string id (the timed activation
 * map is keyed by id, so unidentifiable nodes are skipped silently).
 */
export function resolveRowId(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const candidate = (node as { id?: unknown }).id;
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : null;
}

/**
 * Trace helper for the timed-rule subsystem.
 *
 * Off by default — `setTimeout` + `cellValueChanged` paths fire dozens
 * to hundreds of trace points per second under live ticks. Opt in
 * explicitly per session by setting
 * `window.__CS_TIMED_TRACE__ = true` in the DevTools console.
 */
/**
 * Cheap flag probe for gating trace CALL SITES. `traceTimed` already
 * no-ops when the flag is off, but hot-path callers build a payload
 * object literal per call just to pass it — dozens to hundreds of
 * allocations per second under live ticks for a trace nobody reads.
 * Wrap those sites in `if (isTimedTraceOn())` so the payload is only
 * ever built when someone is actually watching.
 */
export function isTimedTraceOn(): boolean {
  try {
    return (globalThis as { __CS_TIMED_TRACE__?: boolean }).__CS_TIMED_TRACE__ === true;
  } catch {
    return false;
  }
}

export function traceTimed(message: string, payload?: unknown): void {
  try {
    const flag = (globalThis as { __CS_TIMED_TRACE__?: boolean }).__CS_TIMED_TRACE__;
    if (flag !== true) return;
    if (payload === undefined) {
       
      console.log(TRACE_PREFIX, message);
      return;
    }
     
    console.log(TRACE_PREFIX, message, payload);
  } catch {
    // no-op
  }
}
