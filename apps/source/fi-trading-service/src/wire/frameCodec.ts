/**
 * STOMP 1.2 frame serialization.
 *
 * The rules below are not stylistic — they are what the browser client's
 * parser (`transports/fastStompParser.ts`) actually requires:
 *
 *  - The trailing NUL is MANDATORY. On the text path the client finds the
 *    body end with `indexOf` on NUL and ignores `content-length` entirely.
 *    A frame without it stalls the parser forever.
 *  - Bodies must never contain a raw NUL. JSON never does; never send a
 *    binary body as a text frame.
 *  - `content-length` is optional on the text path but we always send it,
 *    so the frame stays valid if a proxy flips it to binary. It must be the
 *    UTF-8 BYTE length, not the JS string length.
 *  - Header values are unescaped by the client for every command EXCEPT
 *    CONNECT and CONNECTED. So CONNECTED headers must go out unescaped and
 *    everything else must be escaped.
 *  - The client keeps the FIRST occurrence of a repeated header, so a header
 *    map (not a list) is the right shape.
 */

/** Commands whose headers travel unescaped, per the STOMP 1.2 spec. */
const NO_ESCAPE_COMMANDS = new Set(['CONNECT', 'CONNECTED']);

/** Frame terminator. */
export const NUL = '\u0000';

/** A bare LF — the STOMP heartbeat. */
export const HEARTBEAT_FRAME = '\n';

/** Escape a header value: backslash first, or the other escapes double up. */
export function escapeHeaderValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/:/g, '\\c');
}

/** Reverse of `escapeHeaderValue`. Unknown escapes are a protocol error. */
export function unescapeHeaderValue(value: string): string {
  if (!value.includes('\\')) return value;
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = value[i + 1];
    i += 1;
    if (next === 'r') out += '\r';
    else if (next === 'n') out += '\n';
    else if (next === 'c') out += ':';
    else if (next === '\\') out += '\\';
    else throw new Error(`Invalid STOMP header escape: backslash-${next ?? '<eof>'}`);
  }
  return out;
}

/**
 * Serialize a frame to its wire text. `body` must not contain a NUL — that
 * is checked, because the failure mode otherwise is a silently truncated
 * frame at the far end rather than an error here.
 */
export function serializeFrame(
  command: string,
  headers: Record<string, string | number | undefined>,
  body = '',
): string {
  if (body.includes(NUL)) {
    throw new Error(`STOMP body for ${command} contains a NUL byte`);
  }
  const escape = !NO_ESCAPE_COMMANDS.has(command);
  let out = `${command}\n`;
  for (const [key, raw] of Object.entries(headers)) {
    if (raw === undefined) continue;
    const value = String(raw);
    out += escape
      ? `${escapeHeaderValue(key)}:${escapeHeaderValue(value)}\n`
      : `${key}:${value}\n`;
  }
  out += `content-length:${Buffer.byteLength(body, 'utf8')}\n`;
  return `${out}\n${body}${NUL}`;
}
