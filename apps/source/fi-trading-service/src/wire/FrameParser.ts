/**
 * Incremental STOMP frame parser for inbound (client to server) frames.
 *
 * Works on Buffers rather than strings so `content-length` is honoured in
 * BYTES. A client sending a multibyte body with a byte-accurate
 * content-length would be mis-sliced by string-index arithmetic, and the
 * failure would only show up for non-ASCII payloads.
 *
 * Accepts both `\n` and `\r\n` line endings on the way in (the spec allows
 * either) even though we only ever emit `\n`.
 */

import { unescapeHeaderValue } from './frameCodec.js';

const LF = 0x0a;
const CR = 0x0d;
const NUL = 0x00;

/** Commands whose header values arrive unescaped, per the spec. */
const NO_UNESCAPE_COMMANDS = new Set(['CONNECT', 'CONNECTED']);

export interface StompFrame {
  command: string;
  headers: Record<string, string>;
  body: string;
}

export interface FrameParserOptions {
  /** Reject a frame larger than this rather than buffering forever. */
  maxFrameBytes?: number;
}

const DEFAULT_MAX_FRAME_BYTES = 4 * 1024 * 1024;

export class FrameParser {
  private buf: Buffer = Buffer.alloc(0);
  private readonly maxFrameBytes: number;

  constructor(options: FrameParserOptions = {}) {
    this.maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
  }

  /**
   * Feed a chunk and take whatever complete frames it completed. Heartbeats
   * (bare EOLs between frames) are consumed and never surface as frames.
   */
  push(chunk: Buffer | string): StompFrame[] {
    const incoming = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    this.buf = this.buf.length === 0 ? incoming : Buffer.concat([this.buf, incoming]);
    if (this.buf.length > this.maxFrameBytes) {
      this.buf = Buffer.alloc(0);
      throw new Error(`STOMP frame exceeds ${this.maxFrameBytes} bytes`);
    }

    const frames: StompFrame[] = [];
    for (;;) {
      this.skipLeadingEol();
      const frame = this.tryTakeFrame();
      if (frame === null) break;
      frames.push(frame);
    }
    return frames;
  }

  /** Bare EOLs between frames are heartbeats — drop them. */
  private skipLeadingEol(): void {
    let i = 0;
    while (i < this.buf.length) {
      const b = this.buf[i];
      if (b === LF) i += 1;
      else if (b === CR && this.buf[i + 1] === LF) i += 2;
      else break;
    }
    if (i > 0) this.buf = this.buf.subarray(i);
  }

  /** Parse one frame off the front, or return null if it is incomplete. */
  private tryTakeFrame(): StompFrame | null {
    const headerEnd = findHeaderEnd(this.buf);
    if (headerEnd < 0) return null;

    const headerText = this.buf.subarray(0, headerEnd).toString('utf8');
    const bodyStart = skipBlankLine(this.buf, headerEnd);

    const lines = headerText.split(/\r?\n/);
    const command = (lines[0] ?? '').trim();
    const headers = parseHeaders(lines.slice(1), command);

    const declared = headers['content-length'];
    let bodyEnd: number;
    if (declared !== undefined) {
      const length = Number.parseInt(declared, 10);
      if (!Number.isFinite(length) || length < 0) {
        throw new Error(`Invalid content-length: ${declared}`);
      }
      bodyEnd = bodyStart + length;
      // Body plus its NUL must both have arrived.
      if (this.buf.length < bodyEnd + 1) return null;
      if (this.buf[bodyEnd] !== NUL) {
        throw new Error(`Frame ${command}: content-length does not reach the NUL terminator`);
      }
    } else {
      const nulIdx = this.buf.indexOf(NUL, bodyStart);
      if (nulIdx < 0) return null;
      bodyEnd = nulIdx;
    }

    const body = this.buf.subarray(bodyStart, bodyEnd).toString('utf8');
    this.buf = this.buf.subarray(bodyEnd + 1);
    return { command, headers, body };
  }
}

/** Index of the blank line separating headers from body, or -1. */
function findHeaderEnd(buf: Buffer): number {
  for (let i = 0; i + 1 < buf.length; i++) {
    if (buf[i] !== LF) continue;
    if (buf[i + 1] === LF) return i;
    if (buf[i + 1] === CR && buf[i + 2] === LF) return i;
  }
  return -1;
}

/** Step past the blank line, which is either LF-LF or LF-CR-LF. */
function skipBlankLine(buf: Buffer, headerEnd: number): number {
  return buf[headerEnd + 1] === CR ? headerEnd + 3 : headerEnd + 2;
}

function parseHeaders(lines: readonly string[], command: string): Record<string, string> {
  const unescape = !NO_UNESCAPE_COMMANDS.has(command);
  const headers: Record<string, string> = {};
  for (const raw of lines) {
    // The header block ends at the LF that starts the blank line, so on a
    // CRLF stream the final line still carries its CR. Strip it per line
    // rather than only from the tail, so the rule holds however the block
    // was split.
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.length === 0) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const rawKey = line.slice(0, colon);
    const rawValue = line.slice(colon + 1);
    const key = unescape ? unescapeHeaderValue(rawKey) : rawKey;
    // First occurrence wins, matching the client's own parser.
    if (headers[key] !== undefined) continue;
    headers[key] = unescape ? unescapeHeaderValue(rawValue) : rawValue;
  }
  return headers;
}
