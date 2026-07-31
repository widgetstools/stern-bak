/**
 * Wire-encoding helpers for {@link SharedWorkerDataServicesHub} snapshot
 * replay + live broadcast chunks. Pure functions — no hub state.
 */
import { tryEncodeColumnar } from '../wire/columnarCodec.js';
import type { EncodedChunk } from './hubTypes.js';

/** Shared encoder for pre-serialized snapshot replay chunks + live patch frames. */
export const SNAPSHOT_ENCODER = new TextEncoder();

/**
 * Encode one rows chunk for the wire. Columnar when the provider opts
 * in AND the frame qualifies (plain-object rows); UTF-8 JSON otherwise.
 */
export function encodeChunk(rows: readonly unknown[], wantColumnar: boolean): EncodedChunk {
  if (wantColumnar) {
    const col = tryEncodeColumnar(rows);
    if (col) return { buf: col, enc: 'col' };
  }
  return { buf: SNAPSHOT_ENCODER.encode(JSON.stringify(rows)), enc: 'json' };
}
