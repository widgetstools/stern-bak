/**
 * columnarCodec — typed-array columnar wire format for hub→window row
 * frames (`delta-col`).
 *
 * The JSON `delta-bin` path pays `JSON.parse` over every byte on every
 * window's main thread. Market-data rows are number-heavy; encoding
 * each top-level field as a COLUMN lets numbers travel as raw
 * `Float64` (8 bytes, zero parse) and booleans as bitmaps, cutting the
 * receiving window's decode cost several-fold on wide numeric feeds.
 * String and nested-object columns fall back to one `JSON.parse` per
 * COLUMN (a flat string array parses much faster than an object graph).
 *
 * Layout (little-endian, single `Uint8Array`):
 *
 *   u32 MAGIC ("COL1")
 *   u32 rowCount
 *   u32 colCount
 *   per column:
 *     u32 nameByteLen, UTF-8 name
 *     u8  tag — low bits: 0=f64, 1=bool, 2=str, 3=json; bit 6: hasNulls
 *     presence bitmap   ceil(rowCount/8) bytes (key present on row)
 *     null bitmap       ceil(rowCount/8) bytes (only when hasNulls)
 *     payload (present AND non-null values, in row order):
 *       f64:  valueCount × 8 bytes
 *       bool: ceil(valueCount/8) bitmap
 *       str / json: u32 byteLen + UTF-8 `JSON.stringify` of the value array
 *
 * Constraints: every row must be a plain (non-array) object and every
 * value JSON-serializable — the same constraint `delta-bin` already
 * imposes. `tryEncodeColumnar` returns `null` when a frame doesn't
 * qualify so callers can fall back to the JSON encoding.
 *
 * Only TOP-LEVEL keys are columnarized; nested objects ride a `json`
 * column whole. With `projectFields` on, rows are already pruned to
 * visible paths, so top-level granularity matches what grids consume.
 */

const MAGIC = 0x434f4c31; // "COL1"

const TAG_F64 = 0;
const TAG_BOOL = 1;
const TAG_STR = 2;
const TAG_JSON = 3;
const TAG_TYPE_MASK = 0x3f;
const TAG_HAS_NULLS = 0x40;

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

interface ColumnPlan {
  name: string;
  nameBytes: Uint8Array;
  /** TAG_F64 / TAG_BOOL / TAG_STR / TAG_JSON, or -1 while undecided. */
  type: number;
  hasNulls: boolean;
  /** Rows where the key exists (null counts as present). */
  presentCount: number;
  /** Present, non-null values count. */
  valueCount: number;
}

function bitmapBytes(bits: number): number {
  return (bits + 7) >> 3;
}

/**
 * Encode a row frame columnar. Returns `null` when any row is not a
 * plain object (caller should fall back to the JSON wire format).
 */
export function tryEncodeColumnar(rows: readonly unknown[]): Uint8Array | null {
  const rowCount = rows.length;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  }
  const objs = rows as ReadonlyArray<Record<string, unknown>>;

  // Pass 1 — discover columns and settle each column's type.
  const plans = new Map<string, ColumnPlan>();
  for (const row of objs) {
    for (const name of Object.keys(row)) {
      const v = row[name];
      if (v === undefined) continue; // treat as absent
      let plan = plans.get(name);
      if (!plan) {
        plan = {
          name,
          nameBytes: ENCODER.encode(name),
          type: -1,
          hasNulls: false,
          presentCount: 0,
          valueCount: 0,
        };
        plans.set(name, plan);
      }
      plan.presentCount += 1;
      if (v === null) {
        plan.hasNulls = true;
        continue;
      }
      plan.valueCount += 1;
      const t =
        typeof v === 'number' ? TAG_F64
        : typeof v === 'boolean' ? TAG_BOOL
        : typeof v === 'string' ? TAG_STR
        : TAG_JSON;
      if (plan.type === -1) plan.type = t;
      else if (plan.type !== t) plan.type = TAG_JSON;
    }
  }
  // All-null columns never settled a type — store them as json.
  for (const plan of plans.values()) {
    if (plan.type === -1) plan.type = TAG_JSON;
  }

  // Pass 2 — pre-serialize str/json column payloads and size the buffer.
  const presenceBytes = bitmapBytes(rowCount);
  const jsonPayloads = new Map<string, Uint8Array>();
  let total = 12; // magic + rowCount + colCount
  for (const plan of plans.values()) {
    total += 4 + plan.nameBytes.byteLength + 1; // name + tag
    total += presenceBytes;
    if (plan.hasNulls) total += presenceBytes;
    if (plan.type === TAG_F64) {
      total += plan.valueCount * 8;
    } else if (plan.type === TAG_BOOL) {
      total += bitmapBytes(plan.valueCount);
    } else {
      const values: unknown[] = [];
      for (const row of objs) {
        const v = row[plan.name];
        if (v !== undefined && v !== null) values.push(v);
      }
      const payload = ENCODER.encode(JSON.stringify(values));
      jsonPayloads.set(plan.name, payload);
      total += 4 + payload.byteLength;
    }
  }

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let pos = 0;
  view.setUint32(pos, MAGIC, true); pos += 4;
  view.setUint32(pos, rowCount, true); pos += 4;
  view.setUint32(pos, plans.size, true); pos += 4;

  for (const plan of plans.values()) {
    view.setUint32(pos, plan.nameBytes.byteLength, true); pos += 4;
    out.set(plan.nameBytes, pos); pos += plan.nameBytes.byteLength;
    out[pos] = plan.type | (plan.hasNulls ? TAG_HAS_NULLS : 0); pos += 1;

    const presenceAt = pos; pos += presenceBytes;
    const nullsAt = plan.hasNulls ? pos : -1;
    if (plan.hasNulls) pos += presenceBytes;

    if (plan.type === TAG_F64) {
      let vi = 0;
      for (let r = 0; r < rowCount; r++) {
        const v = objs[r][plan.name];
        if (v === undefined) continue;
        out[presenceAt + (r >> 3)] |= 1 << (r & 7);
        if (v === null) { out[nullsAt + (r >> 3)] |= 1 << (r & 7); continue; }
        view.setFloat64(pos + vi * 8, v as number, true);
        vi += 1;
      }
      pos += plan.valueCount * 8;
    } else if (plan.type === TAG_BOOL) {
      const valuesAt = pos; pos += bitmapBytes(plan.valueCount);
      let vi = 0;
      for (let r = 0; r < rowCount; r++) {
        const v = objs[r][plan.name];
        if (v === undefined) continue;
        out[presenceAt + (r >> 3)] |= 1 << (r & 7);
        if (v === null) { out[nullsAt + (r >> 3)] |= 1 << (r & 7); continue; }
        if (v === true) out[valuesAt + (vi >> 3)] |= 1 << (vi & 7);
        vi += 1;
      }
    } else {
      for (let r = 0; r < rowCount; r++) {
        const v = objs[r][plan.name];
        if (v === undefined) continue;
        out[presenceAt + (r >> 3)] |= 1 << (r & 7);
        if (v === null) out[nullsAt + (r >> 3)] |= 1 << (r & 7);
      }
      const payload = jsonPayloads.get(plan.name)!;
      view.setUint32(pos, payload.byteLength, true); pos += 4;
      out.set(payload, pos); pos += payload.byteLength;
    }
  }

  return out;
}

/** Decode a `tryEncodeColumnar` buffer back into row objects. */
export function decodeColumnar(buf: Uint8Array): unknown[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 0;
  const magic = view.getUint32(pos, true); pos += 4;
  if (magic !== MAGIC) {
    throw new Error('[columnarCodec] bad magic — buffer is not a COL1 frame');
  }
  const rowCount = view.getUint32(pos, true); pos += 4;
  const colCount = view.getUint32(pos, true); pos += 4;

  const rows: Array<Record<string, unknown>> = new Array(rowCount);
  for (let r = 0; r < rowCount; r++) rows[r] = {};

  const presenceBytes = bitmapBytes(rowCount);
  for (let c = 0; c < colCount; c++) {
    const nameLen = view.getUint32(pos, true); pos += 4;
    const name = DECODER.decode(buf.subarray(pos, pos + nameLen)); pos += nameLen;
    const tag = buf[pos]; pos += 1;
    const type = tag & TAG_TYPE_MASK;
    const hasNulls = (tag & TAG_HAS_NULLS) !== 0;

    const presenceAt = pos; pos += presenceBytes;
    const nullsAt = hasNulls ? pos : -1;
    if (hasNulls) pos += presenceBytes;

    if (type === TAG_F64) {
      let vi = 0;
      const valuesAt = pos;
      for (let r = 0; r < rowCount; r++) {
        if (!(buf[presenceAt + (r >> 3)] & (1 << (r & 7)))) continue;
        if (hasNulls && (buf[nullsAt + (r >> 3)] & (1 << (r & 7)))) {
          rows[r][name] = null;
          continue;
        }
        rows[r][name] = view.getFloat64(valuesAt + vi * 8, true);
        vi += 1;
      }
      pos = valuesAt + vi * 8;
    } else if (type === TAG_BOOL) {
      // Value count isn't stored — derive it by walking presence/null
      // bitmaps once (cheap: bit tests over rowCount).
      let vi = 0;
      const valuesAt = pos;
      for (let r = 0; r < rowCount; r++) {
        if (!(buf[presenceAt + (r >> 3)] & (1 << (r & 7)))) continue;
        if (hasNulls && (buf[nullsAt + (r >> 3)] & (1 << (r & 7)))) {
          rows[r][name] = null;
          continue;
        }
        rows[r][name] = (buf[valuesAt + (vi >> 3)] & (1 << (vi & 7))) !== 0;
        vi += 1;
      }
      pos = valuesAt + bitmapBytes(vi);
    } else {
      const byteLen = view.getUint32(pos, true); pos += 4;
      const values = JSON.parse(
        DECODER.decode(buf.subarray(pos, pos + byteLen)),
      ) as unknown[];
      pos += byteLen;
      let vi = 0;
      for (let r = 0; r < rowCount; r++) {
        if (!(buf[presenceAt + (r >> 3)] & (1 << (r & 7)))) continue;
        if (hasNulls && (buf[nullsAt + (r >> 3)] & (1 << (r & 7)))) {
          rows[r][name] = null;
          continue;
        }
        rows[r][name] = values[vi];
        vi += 1;
      }
    }
  }

  return rows;
}
