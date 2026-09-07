/**
 * STOMP heartbeat negotiation.
 *
 * The header is `heart-beat:<cx>,<cy>` where `cx` is the smallest interval
 * the sender can guarantee it will send in, and `cy` is the smallest it can
 * accept receiving in. Zero on either side means "not supported".
 *
 * The effective interval in one direction is `max(sender.cx, receiver.cy)`,
 * or nothing at all if either is zero.
 *
 * Advertising a real interval rather than the `0,0` the reference server
 * sends is a deliberate trade: it arms the client's watchdog (it closes the
 * socket after twice the interval of silence), which turns a half-open TCP
 * connection into a clean reconnect instead of a provider that hangs in
 * `loading` forever. In exchange the server owes a bare LF on that cadence.
 */

export interface HeartbeatSettings {
  /** Interval we must send on, ms. 0 = don't. */
  sendEveryMs: number;
  /** Interval we should expect frames on, ms. 0 = don't police it. */
  expectEveryMs: number;
}

/** Parse a `heart-beat` header into its two numbers, defaulting to 0,0. */
export function parseHeartbeatHeader(header: string | undefined): [number, number] {
  if (header === undefined) return [0, 0];
  const parts = header.split(',');
  const cx = Number.parseInt((parts[0] ?? '').trim(), 10);
  const cy = Number.parseInt((parts[1] ?? '').trim(), 10);
  return [Number.isFinite(cx) && cx > 0 ? cx : 0, Number.isFinite(cy) && cy > 0 ? cy : 0];
}

/**
 * Work out what we actually owe, given the client's header and what we
 * advertise.
 */
export function negotiateHeartbeat(
  clientHeader: string | undefined,
  serverSendMs: number,
  serverReceiveMs: number,
): HeartbeatSettings {
  const [clientCx, clientCy] = parseHeartbeatHeader(clientHeader);
  const sendEveryMs = serverSendMs === 0 || clientCy === 0 ? 0 : Math.max(serverSendMs, clientCy);
  const expectEveryMs =
    serverReceiveMs === 0 || clientCx === 0 ? 0 : Math.max(serverReceiveMs, clientCx);
  return { sendEveryMs, expectEveryMs };
}
