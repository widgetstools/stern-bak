/**
 * Whether this window runs the blotter on the Perspective row engine.
 *
 * `?perspective=1` — a URL flag rather than a config setting, because the whole
 * point of the demo is running the two engines side by side against the same
 * broker, the same columns and the same profiles: open one tab with the flag
 * and one without, and any difference between them is the row engine and
 * nothing else.
 *
 * It has to be readable BEFORE React mounts, since it decides which of the two
 * SharedWorker assets boots — only one of them hosts a Perspective Table, and
 * that is settled at `new SharedWorker()` time.
 */

export function isPerspectiveMode(): boolean {
  if (typeof window === 'undefined') return false;
  const flag = new URLSearchParams(window.location.search).get('perspective');
  return flag === '1' || flag === 'true';
}
