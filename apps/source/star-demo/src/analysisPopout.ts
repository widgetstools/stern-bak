/**
 * Opens the Analysis window — the surface with room to actually draw.
 *
 * Mirrors `aiAssistantPopout.ts`: one transport (`runtime.openSurface`)
 * regardless of host, with context read back in the route
 * (`views/Analysis.tsx`).
 *
 * Why a window at all. The chat's analysis side panel is a 38% `ResizablePanel`
 * inside a 1000x820 popout, which leaves roughly 337x190px of plot area, and
 * its height is structurally fixed — the content scroller is auto-height, so a
 * chart's `h-full` resolves to `auto` and falls back to its floor no matter how
 * tall the window gets. A 30-column pivot is some 4000px of table read through
 * that. It is also the worst possible host for a live report: the transcript
 * commits on every streamed token, so anything inside it redraws continuously
 * while the model narrates.
 *
 * The handoff goes through `localStorage` rather than the URL. A query would
 * fit in a query string; a report spec would not, and a URL long enough to
 * carry one is a URL that gets truncated somewhere unhelpful. Both windows are
 * the same origin, so the key travels and the payload stays local.
 */
import type { RuntimePort } from '@wellsfargo-starui/core/host';
import type { DataQuery, ReportSpec } from '@wellsfargo-starui/data';

/** Roomier than the assistant's 1000x820 — this one exists for the width. */
const POPOUT_WIDTH = 1440;
const POPOUT_HEIGHT = 900;

const HANDOFF_PREFIX = 'starui.analysis.';
/** Handoffs are read once on open; anything older is a window that never
 *  opened, or one whose spec has long since been replaced. */
const HANDOFF_TTL_MS = 10 * 60_000;

export type AnalysisHandoff =
  | { kind: 'query'; query: DataQuery; chart?: string; title?: string; asOf?: string }
  | { kind: 'report'; spec: ReportSpec };

interface StoredHandoff {
  at: number;
  gridId?: string;
  instanceId?: string;
  displayName?: string;
  payload: AnalysisHandoff;
}

/**
 * Which analysis window this is.
 *
 * One blotter can have several open at once — that is the point of asking for
 * a new one: a trader comparing two cuts of the same book needs both on screen,
 * not one replacing the other. `MAIN_WINDOW_ID` is the unnamed default, so a
 * caller that doesn't care keeps the old one-window-per-blotter behaviour.
 */
export const MAIN_WINDOW_ID = 'main';

export interface OpenAnalysisOpts {
  /** The calling window's own config-row id, same contract as the assistant. */
  instanceId?: string;
  /** Component Registry id, when the caller knows it. */
  gridId?: string;
  displayName?: string;
  payload: AnalysisHandoff;
  /**
   * Which window to draw into. Omitted means the blotter's main analysis
   * window; a distinct id opens (or re-targets) an additional one.
   */
  windowId?: string;
  /** Title recorded in the registry, so a later call can say which is which. */
  windowTitle?: string;
  /** Mounted route path. Defaults to `/analysis`. */
  route?: string;
}

/** An analysis window this session has opened. */
export interface AnalysisWindowRecord {
  id: string;
  title?: string;
  gridId?: string;
  openedAt: number;
  /**
   * What the window was last showing.
   *
   * Kept so a window can be reloaded or reopened WITHOUT its author having to
   * reconstruct the spec. The handoff that carried it expires after
   * `HANDOFF_TTL_MS` — deliberately, so the key space stays bounded — which
   * would otherwise make "reopen what you just made" impossible ten minutes
   * later, exactly when someone is most likely to ask for it.
   */
  payload?: AnalysisHandoff;
  /**
   * When the window was last accessed (opened or reloaded). Stale windows
   * that haven't been touched in a while can be pruned from the registry to
   * prevent accumulation and ID drift — the user is unlikely to want to
   * reopen something they closed an hour ago.
   */
  accessedAt?: number;
}

const REGISTRY_KEY = 'starui.analysis.windows';
const MAX_REGISTERED = 12;

/**
 * Remembers which analysis windows have been opened, so the assistant can name
 * them back to the user and re-target one later.
 *
 * The registry is pruned when it grows beyond MAX_REGISTERED — oldest windows
 * are dropped first. Windows marked as accessed recently are kept; windows the
 * user opened hours ago and never touched again are unlikely to matter.
 */
export function listAnalysisWindows(gridId?: string): AnalysisWindowRecord[] {
  try {
    const raw = window.localStorage.getItem(REGISTRY_KEY);
    const all = raw ? (JSON.parse(raw) as AnalysisWindowRecord[]) : [];
    if (!Array.isArray(all)) return [];
    return gridId ? all.filter((w) => w.gridId === gridId) : all;
  } catch {
    return [];
  }
}

function registerWindow(record: AnalysisWindowRecord): void {
  try {
    const all = listAnalysisWindows().filter((w) => !(w.id === record.id && w.gridId === record.gridId));
    all.push({ ...record, accessedAt: Date.now() });
    // Sort by accessedAt (most recent first) and keep only MAX_REGISTERED, so
    // old unused windows drop off the end and IDs don't drift unbounded.
    const sorted = all.sort((a, b) => (b.accessedAt ?? b.openedAt) - (a.accessedAt ?? a.openedAt));
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(sorted.slice(0, MAX_REGISTERED)));
  } catch {
    /* storage unavailable — the window still opens, it just isn't listed */
  }
}

/** Remove a window from the registry so it won't show up in lists or be reopenable. */
export function removeAnalysisWindow(windowId: string, gridId?: string): void {
  try {
    const all = listAnalysisWindows();
    const filtered = all.filter((w) => !(w.id === windowId && (!gridId || w.gridId === gridId)));
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(filtered));
  } catch {
    /* storage unavailable — nothing to remove */
  }
}

/** A short, readable id for an additional window: `w2`, `w3`, … */
export function nextWindowId(gridId?: string): string {
  const taken = new Set(listAnalysisWindows(gridId).map((w) => w.id));
  for (let n = 2; n < MAX_REGISTERED + 2; n++) {
    const id = `w${n}`;
    if (!taken.has(id)) return id;
  }
  return `w${Date.now().toString(36).slice(-4)}`;
}

function handoffKey(id: string): string {
  return `${HANDOFF_PREFIX}${id}`;
}

/** Best-effort: a private window or a storage-blocked context must not take
 *  the whole feature down with it. */
export function writeHandoff(id: string, value: StoredHandoff): boolean {
  try {
    window.localStorage.setItem(handoffKey(id), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readHandoff(id: string): StoredHandoff | null {
  try {
    const raw = window.localStorage.getItem(handoffKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredHandoff;
    if (!parsed || typeof parsed !== 'object' || !parsed.payload) return null;
    // Deliberately NOT deleted on read: the window re-reads it on reload and
    // on a refresh tick, and a one-shot key would leave a reloaded window
    // blank. The sweep below is what bounds the growth instead.
    if (Date.now() - parsed.at > HANDOFF_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Drops expired handoffs so the key space cannot grow without bound. */
export function sweepHandoffs(now = Date.now()): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(HANDOFF_PREFIX)) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) ?? '{}') as StoredHandoff;
        if (!parsed?.at || now - parsed.at > HANDOFF_TTL_MS) stale.push(key);
      } catch {
        stale.push(key);
      }
    }
    for (const key of stale) window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — nothing to sweep */
  }
}

export function buildAnalysisUrl(handoffId: string, opts: OpenAnalysisOpts): string {
  const route = opts.route ?? '/analysis';
  const params = new URLSearchParams({ handoff: handoffId });
  if (opts.windowId && opts.windowId !== MAIN_WINDOW_ID) params.set('w', opts.windowId);
  if (opts.gridId) params.set('grid', opts.gridId);
  if (opts.instanceId) params.set('instance', opts.instanceId);
  if (opts.displayName) params.set('name', opts.displayName);
  return `${window.location.origin}/#${route}?${params.toString()}`;
}

/** Distinct per open, so a second analysis never reads the first one's spec. */
function newHandoffId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * One window per (blotter, windowId). Re-opening the same pair re-targets that
 * window rather than stacking duplicates the user has to close one by one;
 * asking for a different id gets a genuinely separate window.
 */
function windowNameFor(opts: OpenAnalysisOpts): string {
  const scope = opts.gridId ?? opts.instanceId ?? 'default';
  return `analysis-${scope}-${opts.windowId ?? MAIN_WINDOW_ID}`;
}

/** Stores the handoff and returns the URL that will read it back. */
function stageHandoff(opts: OpenAnalysisOpts): string {
  sweepHandoffs();
  const id = newHandoffId();
  writeHandoff(id, {
    at: Date.now(),
    gridId: opts.gridId,
    instanceId: opts.instanceId,
    displayName: opts.displayName,
    payload: opts.payload,
  });
  registerWindow({
    id: opts.windowId ?? MAIN_WINDOW_ID,
    title: opts.windowTitle,
    gridId: opts.gridId,
    openedAt: Date.now(),
    payload: opts.payload,
  });
  return buildAnalysisUrl(id, opts);
}

export async function openAnalysisPopout(runtime: RuntimePort, opts: OpenAnalysisOpts): Promise<void> {
  await runtime.openSurface({
    kind: 'popout',
    url: stageHandoff(opts),
    windowName: windowNameFor(opts),
    width: POPOUT_WIDTH,
    height: POPOUT_HEIGHT,
  });
}

export type ReopenOutcome =
  | { ok: true; record: AnalysisWindowRecord }
  | { ok: false; error: string; known: AnalysisWindowRecord[] };

/**
 * Re-opens a window from what it was last showing.
 *
 * One operation covers both "reload" and "reopen": every open stages a FRESH
 * handoff id, so the URL always differs and the runtime genuinely navigates
 * rather than no-opping on an identical address. A window that is still open
 * therefore remounts and re-runs its queries; one the user has closed is
 * simply created again with the same content. The caller does not have to know
 * which case it is in, which is the point — nor does the model.
 */
export async function reopenAnalysisWindow(opts: {
  gridId?: string;
  instanceId?: string;
  displayName?: string;
  windowId?: string;
}): Promise<ReopenOutcome> {
  const wanted = opts.windowId ?? MAIN_WINDOW_ID;
  const known = listAnalysisWindows(opts.gridId);
  const record = known.find((w) => w.id === wanted);

  if (!record?.payload) {
    return {
      ok: false,
      error: record
        ? `Analysis window "${wanted}" is known but nothing was recorded for it to show.`
        : `No analysis window "${wanted}" has been opened for this blotter.`,
      known,
    };
  }

  const opened = await openAnalysisSurface({
    gridId: opts.gridId ?? record.gridId,
    instanceId: opts.instanceId,
    displayName: opts.displayName,
    windowId: record.id,
    windowTitle: record.title,
    payload: record.payload,
  });

  if (opened.ok) {
    // Mark as accessed so it stays in the registry when the user re-opens it
    registerWindow({ ...record, accessedAt: Date.now() });
  }

  return opened.ok ? { ok: true, record } : { ok: false, error: opened.error, known };
}

function hasOpenFin(): boolean {
  return typeof (globalThis as { fin?: unknown }).fin !== 'undefined';
}

/**
 * Opens the window from somewhere with no `RuntimePort` in context — which is
 * the assistant window, where the tool that opens this actually runs.
 *
 * The OpenFin import is DYNAMIC for the same reason `launchComponent.ts` does
 * it: pulling the runtime at module-eval time breaks the assistant in a plain
 * browser and in the unit suite. `window.open` is the browser path, and its
 * name argument gives the same one-window-per-blotter dedup.
 */
export async function openAnalysisSurface(opts: OpenAnalysisOpts): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = stageHandoff(opts);
  const name = windowNameFor(opts);
  try {
    if (hasOpenFin()) {
      const mod = await import('@wellsfargo-starui/openfin/host');
      const runtime = await mod.OpenFinRuntime.create();
      await runtime.openSurface({ kind: 'popout', url, windowName: name, width: POPOUT_WIDTH, height: POPOUT_HEIGHT });
      return { ok: true };
    }
    const opened = window.open(url, name, `width=${POPOUT_WIDTH},height=${POPOUT_HEIGHT}`);
    if (!opened) return { ok: false, error: 'The browser blocked the window — allow pop-ups for this site.' };
    opened.focus();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
