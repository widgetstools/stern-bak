/**
 * Yield to the macrotask queue and continue — the hop between replay
 * passes (worker-split W4). A MessageChannel hop is a true macrotask with
 * no timer clamping (worker `setTimeout(0)` still costs ~1 ms and nested
 * timers clamp to 4 ms); `setTimeout(0)` is the fallback where
 * MessageChannel is unavailable.
 */

let channel: MessageChannel | null = null;
const queue: Array<() => void> = [];

function drain(): void {
  const cb = queue.shift();
  if (cb) cb();
}

export function yieldToMacrotask(cb: () => void): void {
  if (typeof MessageChannel === 'undefined') {
    setTimeout(cb, 0);
    return;
  }
  if (!channel) {
    channel = new MessageChannel();
    channel.port1.onmessage = drain;
  }
  queue.push(cb);
  channel.port2.postMessage(null);
}
