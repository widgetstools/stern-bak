/**
 * Minimal STOMP 1.2 framing — just enough to serve `@stomp/stompjs`
 * (the client the platform's stomp transport uses). Frames are
 * `COMMAND\nheader:value\n…\n\nbody\0`; the client may also send bare
 * `\n` heart-beats, which parse to null and are ignored.
 */

export function parseFrame(raw) {
  const text = raw.replace(/\0+$/, '');
  if (!text.trim()) return null;
  const headerEnd = text.indexOf('\n\n');
  const head = headerEnd === -1 ? text : text.slice(0, headerEnd);
  const body = headerEnd === -1 ? '' : text.slice(headerEnd + 2);
  const lines = head.split('\n');
  const command = (lines[0] ?? '').trim();
  if (!command) return null;
  const headers = {};
  for (const line of lines.slice(1)) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { command, headers, body };
}

export function serializeFrame(command, headers = {}, body = '') {
  let frame = `${command}\n`;
  for (const [k, v] of Object.entries(headers)) frame += `${k}:${v}\n`;
  if (body) frame += `content-length:${Buffer.byteLength(body, 'utf8')}\n`;
  frame += '\n';
  if (body) frame += body;
  return `${frame}\0`;
}
