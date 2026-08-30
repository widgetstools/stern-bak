/**
 * fastStompParser — vectorized STOMP 1.2 frame parsing.
 *
 * Why this exists: @stomp/stompjs parses incoming data ONE BYTE AT A
 * TIME through a JS state machine (`parseChunk` → `_onByte` →
 * `_collectBodyNullTerminated` → `token.push(byte)`). At streaming
 * rates that per-byte function dispatch dominated the SharedWorker —
 * measured live at ~30% of the thread at ~4.4MB/s, enough to starve
 * the conflation timer (see bufferedDispatch's `maxBufferedRows` doc).
 *
 * The actual work is boundary-finding: headers end at a blank line,
 * the body ends at NUL (or after `content-length` bytes). Both are
 * exactly what the engine's native scans do at memchr speed:
 *
 *   • text WebSocket frames  → `string.indexOf('\n\n')` / `indexOf('\0')`
 *     and the body slice IS the JSON string — no decode step at all.
 *   • binary frames          → `Uint8Array.indexOf(10)` for the header
 *     block, `content-length` arithmetic or `indexOf(0)` for the body,
 *     one `TextDecoder.decode()` per section.
 *
 * Coverage (deliberately the surface our transports use, documented
 * over exhaustive): CONNECTED / MESSAGE / ERROR / RECEIPT frames,
 * heart-beat LFs (CR tolerated), frames split across WebSocket
 * messages, multiple frames per message, STOMP 1.2 header escaping,
 * `content-length` honoured on the binary path. NOT covered: bodies
 * containing NUL delivered as TEXT frames (a broker streaming binary
 * bodies must use binary WebSocket frames — ours all ship JSON).
 */

export interface StompFrame {
  command: string;
  headers: Record<string, string>;
  body: string;
}

/** STOMP 1.2 header-value unescape: \n \r \c \\ (in spec'd order). */
export function unescapeHeaderValue(value: string): string {
  if (value.indexOf('\\') === -1) return value;
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch !== '\\') { out += ch; continue; }
    const next = value[i + 1];
    if (next === 'n') { out += '\n'; i++; }
    else if (next === 'r') { out += '\r'; i++; }
    else if (next === 'c') { out += ':'; i++; }
    else if (next === '\\') { out += '\\'; i++; }
    else out += ch; // lone backslash — pass through rather than throw
  }
  return out;
}

/** STOMP 1.2 header-value escape for outgoing frames. */
export function escapeHeaderValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/:/g, '\\c');
}

const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder();

/**
 * Serialize an outgoing frame. Header escaping applies to every command
 * except CONNECT/CONNECTED (per spec §"Value Encoding"). `content-length`
 * is always included so bodies survive brokers that don't NUL-scan.
 */
export function serializeFrame(
  command: string,
  headers: Record<string, string>,
  body = '',
): string {
  const noEscape = command === 'CONNECT' || command === 'CONNECTED';
  let out = command + '\n';
  for (const [k, v] of Object.entries(headers)) {
    out += noEscape ? `${k}:${v}\n` : `${escapeHeaderValue(k)}:${escapeHeaderValue(v)}\n`;
  }
  if (body) {
    out += `content-length:${UTF8_ENCODER.encode(body).byteLength}\n`;
  }
  return out + '\n' + body + '\0';
}

function parseHeaderBlock(block: string, command: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const noUnescape = command === 'CONNECT' || command === 'CONNECTED';
  let lineStart = 0;
  while (lineStart < block.length) {
    let lineEnd = block.indexOf('\n', lineStart);
    if (lineEnd === -1) lineEnd = block.length;
    let line = block.slice(lineStart, lineEnd);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    const colon = line.indexOf(':');
    if (colon > 0) {
      const rawKey = line.slice(0, colon);
      const rawVal = line.slice(colon + 1);
      const key = noUnescape ? rawKey : unescapeHeaderValue(rawKey);
      // Per spec, the FIRST occurrence of a repeated header wins.
      if (!(key in headers)) {
        headers[key] = noUnescape ? rawVal : unescapeHeaderValue(rawVal);
      }
    }
    lineStart = lineEnd + 1;
  }
  return headers;
}

export interface FastStompFrameParserCallbacks {
  onFrame: (frame: StompFrame) => void;
  /** One call per incoming heart-beat LF. */
  onHeartbeat?: () => void;
}

export class FastStompFrameParser {
  private strBuf = '';
  private binBuf: Uint8Array | null = null;

  constructor(private readonly callbacks: FastStompFrameParserCallbacks) {}

  /** Feed one WebSocket message (or arbitrary chunk) into the parser. */
  feed(data: string | ArrayBuffer | Uint8Array): void {
    if (typeof data === 'string') {
      // A stray binary remainder with text arriving next (brokers do
      // not interleave in practice): decode it into the string stream.
      if (this.binBuf) {
        this.strBuf += UTF8_DECODER.decode(this.binBuf);
        this.binBuf = null;
      }
      this.strBuf += data;
      this.drainText();
      return;
    }
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (this.strBuf) {
      // Text remainder ahead of binary: carry it over as bytes.
      const prev = UTF8_ENCODER.encode(this.strBuf);
      this.strBuf = '';
      const joined = new Uint8Array(prev.byteLength + bytes.byteLength);
      joined.set(prev, 0);
      joined.set(bytes, prev.byteLength);
      this.binBuf = joined;
    } else if (this.binBuf) {
      const joined = new Uint8Array(this.binBuf.byteLength + bytes.byteLength);
      joined.set(this.binBuf, 0);
      joined.set(bytes, this.binBuf.byteLength);
      this.binBuf = joined;
    } else {
      this.binBuf = bytes;
    }
    this.drainBinary();
  }

  /** Drop any partial frame (reconnect / teardown). */
  reset(): void {
    this.strBuf = '';
    this.binBuf = null;
  }

  // ── text path — zero decode, native string scans ─────────────────

  private drainText(): void {
    const buf = this.strBuf;
    let pos = 0;
    for (;;) {
      // Heart-beats between frames: bare LF, CR tolerated.
      while (pos < buf.length && (buf[pos] === '\n' || buf[pos] === '\r')) {
        if (buf[pos] === '\n') this.callbacks.onHeartbeat?.();
        pos++;
      }
      if (pos >= buf.length) { this.strBuf = ''; return; }

      const headerEnd = this.findTextHeaderEnd(buf, pos);
      if (headerEnd === -1) { this.strBuf = pos > 0 ? buf.slice(pos) : buf; return; }

      const nulIdx = buf.indexOf('\0', headerEnd);
      if (nulIdx === -1) { this.strBuf = pos > 0 ? buf.slice(pos) : buf; return; }

      this.emitTextFrame(buf, pos, headerEnd, nulIdx);
      pos = nulIdx + 1;
    }
  }

  /** Index of the first body character, or -1 if the header block is
   *  incomplete. Handles both `\n\n` and `\r\n\r\n` terminators. */
  private findTextHeaderEnd(buf: string, pos: number): number {
    const lf = buf.indexOf('\n\n', pos);
    const crlf = buf.indexOf('\r\n\r\n', pos);
    if (lf === -1 && crlf === -1) return -1;
    if (crlf !== -1 && (lf === -1 || crlf < lf)) return crlf + 4;
    return lf + 2;
  }

  private emitTextFrame(buf: string, pos: number, bodyStart: number, nulIdx: number): void {
    const headerBlock = buf.slice(pos, bodyStart - 1); // trailing separator trimmed by line loop
    const firstLineEnd = headerBlock.indexOf('\n');
    let command = firstLineEnd === -1 ? headerBlock : headerBlock.slice(0, firstLineEnd);
    if (command.endsWith('\r')) command = command.slice(0, -1);
    const headers = firstLineEnd === -1
      ? {}
      : parseHeaderBlock(headerBlock.slice(firstLineEnd + 1), command);
    const body = buf.slice(bodyStart, nulIdx);
    this.callbacks.onFrame({ command, headers, body });
  }

  // ── binary path — Uint8Array scans + one decode per section ──────

  private drainBinary(): void {
    const buf = this.binBuf;
    if (!buf) return;
    let pos = 0;
    for (;;) {
      while (pos < buf.length && (buf[pos] === 10 || buf[pos] === 13)) {
        if (buf[pos] === 10) this.callbacks.onHeartbeat?.();
        pos++;
      }
      if (pos >= buf.length) { this.binBuf = null; return; }

      const headerEnd = this.findBinaryHeaderEnd(buf, pos);
      if (headerEnd === -1) { this.keepBinaryRemainder(buf, pos); return; }

      const headerBlock = UTF8_DECODER.decode(buf.subarray(pos, headerEnd));
      const firstLineEnd = headerBlock.indexOf('\n');
      let command = firstLineEnd === -1 ? headerBlock : headerBlock.slice(0, firstLineEnd);
      if (command.endsWith('\r')) command = command.slice(0, -1);
      const headers = firstLineEnd === -1
        ? {}
        : parseHeaderBlock(headerBlock.slice(firstLineEnd + 1), command);

      // headerEnd points AT the first LF of the blank-line separator:
      // `\n\n` (2 bytes) or `\n\r\n` (3 — the preceding \r belongs to
      // the last header line and is stripped by parseHeaderBlock).
      const sepLen = buf[headerEnd + 1] === 10 ? 2 : 3;
      const start = headerEnd + sepLen;

      const cl = headers['content-length'] !== undefined
        ? Number.parseInt(headers['content-length'], 10)
        : NaN;
      let bodyEnd: number;
      if (Number.isFinite(cl) && cl >= 0) {
        if (start + cl >= buf.length) { this.keepBinaryRemainder(buf, pos); return; }
        bodyEnd = start + cl; // NUL expected at bodyEnd
      } else {
        bodyEnd = buf.indexOf(0, start);
        if (bodyEnd === -1) { this.keepBinaryRemainder(buf, pos); return; }
      }
      const body = bodyEnd > start ? UTF8_DECODER.decode(buf.subarray(start, bodyEnd)) : '';
      this.callbacks.onFrame({ command, headers, body });
      pos = bodyEnd + 1; // step over the NUL
    }
  }

  /** Index of the blank-line separator start (`\n\n` or `\r\n\r\n`),
   *  or -1 if incomplete. */
  private findBinaryHeaderEnd(buf: Uint8Array, pos: number): number {
    let i = pos;
    for (;;) {
      const lf = buf.indexOf(10, i);
      if (lf === -1 || lf + 1 >= buf.length) return -1;
      if (buf[lf + 1] === 10) return lf; // \n\n
      if (buf[lf + 1] === 13 && buf[lf + 2] === 10) return lf; // \n\r\n (CRLF block)
      i = lf + 1;
    }
  }

  private keepBinaryRemainder(buf: Uint8Array, pos: number): void {
    // Copy (not subarray) so a huge parent WebSocket buffer isn't pinned
    // by a tiny tail.
    this.binBuf = pos > 0 ? buf.slice(pos) : buf;
  }
}
