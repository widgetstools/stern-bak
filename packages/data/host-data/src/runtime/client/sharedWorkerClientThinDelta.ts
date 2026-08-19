/**
 * Thin-delta row mirroring for {@link SharedWorkerDataServicesClient}.
 * Extracted so the client class reads as attach/detach orchestration.
 */
import type { DeltaPatchEvent, RowPatch } from '../protocol.js';
import { composeRowId } from '@wellsfargo-starui/types';

export interface ThinSubState {
  keyColumn?: string | readonly string[];
  rows: Map<string, unknown>;
}

export type SubId = string;

/** Shared decoder for pre-serialized snapshot replay chunks (`delta-bin`). */
export const SNAPSHOT_DECODER = new TextDecoder();

export function trackThinRows(
  thinSubs: Map<SubId, ThinSubState>,
  subId: SubId,
  rows: readonly unknown[],
  replace: boolean,
): void {
  const state = thinSubs.get(subId);
  if (!state) return;
  if (replace) state.rows.clear();
  for (const row of rows) {
    const k = composeRowId(row, state.keyColumn);
    if (k !== null) state.rows.set(k, row);
  }
}

export function mergeThinPatches(
  thinSubs: Map<SubId, ThinSubState>,
  event: DeltaPatchEvent,
): unknown[] {
  const state = thinSubs.get(event.subId);
  if (!state) return [];
  const patches: readonly RowPatch[] = event.patches
    ?? (event.buf
      ? JSON.parse(SNAPSHOT_DECODER.decode(event.buf)) as RowPatch[]
      : []);
  const out: unknown[] = [];
  for (const p of patches) {
    if (p.f !== undefined) {
      state.rows.set(p.k, p.f);
      out.push(p.f);
      continue;
    }
    const prev = state.rows.get(p.k);
    if (!prev || typeof prev !== 'object') continue;
    const next: Record<string, unknown> = { ...(prev as Record<string, unknown>), ...(p.s ?? {}) };
    if (p.d) for (const name of p.d) delete next[name];
    state.rows.set(p.k, next);
    out.push(next);
  }
  return out;
}
