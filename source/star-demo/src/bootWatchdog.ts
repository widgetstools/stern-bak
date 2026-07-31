/**
 * Boot watchdog — self-heal a view whose platform bootstrap stalled.
 *
 * Incident (2026-07-30): a blotter view reloaded overnight (~3am,
 * Windows maintenance wake reloads Vite-connected pages) while the
 * machine/network was mid-sleep. Its bootstrap awaited a connection
 * that never resolved: `document.readyState: complete`, ZERO
 * `starui:*` boot marks, empty React root — a permanently WHITE view,
 * because the bootstrap promise is cached per-document and nothing
 * retries it. A manual reload booted the same view instantly.
 *
 * Policy: if NO `starui:*` performance mark has landed within
 * {@link BOOT_STALL_MS}, the boot is stalled (the first mark,
 * `config-ready`, lands in <2s on any healthy path — both config-only
 * and data windows). Self-heal with ONE automatic reload, guarded by a
 * sessionStorage counter so a genuinely dead backend cannot cause a
 * reload loop. On a second stall, inject a minimal retry screen (plain
 * DOM — React never mounted) and log loudly. The counter clears once
 * boot succeeds so a long-lived session can heal again days later.
 */

const BOOT_STALL_MS = 30_000;
const RELOAD_GUARD_KEY = 'starui-boot-watchdog-reloads';
const MARK_PREFIX = 'starui:';

function bootMarkLanded(): boolean {
  try {
    return performance
      .getEntriesByType('mark')
      .some((m) => m.name.startsWith(MARK_PREFIX));
  } catch {
    return true; // no Performance API — never reload on blind suspicion
  }
}

function guardCount(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '0');
  } catch {
    return Number.MAX_SAFE_INTEGER; // no storage — never auto-reload
  }
}

function showStallScreen(): void {
  const root = document.getElementById('root');
  if (!root || root.childElementCount > 0) return;
  root.innerHTML = `
    <div style="display:flex;height:100vh;align-items:center;justify-content:center;
                font-family:system-ui,sans-serif;color:var(--foreground,#ddd);
                background:var(--background,#111);">
      <div style="text-align:center;max-width:26rem;">
        <p style="font-size:0.95rem;margin-bottom:1rem;">
          Platform boot stalled twice — the data services may be unreachable.
        </p>
        <button style="padding:0.4rem 1.2rem;cursor:pointer;"
                onclick="sessionStorage.removeItem('${RELOAD_GUARD_KEY}');location.reload()">
          Retry
        </button>
      </div>
    </div>`;
}

export function installBootWatchdog(): void {
  if (typeof window === 'undefined') return;
  setTimeout(() => {
    if (bootMarkLanded()) {
      try { sessionStorage.removeItem(RELOAD_GUARD_KEY); } catch { /* noop */ }
      return;
    }
    const reloads = guardCount();
    if (reloads < 1) {
      // eslint-disable-next-line no-console
      console.warn('[boot-watchdog] no boot mark after 30s — reloading once to self-heal');
      try { sessionStorage.setItem(RELOAD_GUARD_KEY, String(reloads + 1)); } catch { /* noop */ }
      location.reload();
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[boot-watchdog] boot stalled again after self-heal reload — backend unreachable?');
    showStallScreen();
  }, BOOT_STALL_MS);
}
