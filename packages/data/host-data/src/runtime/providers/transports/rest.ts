/**
 * REST provider — `startRest(cfg, emit)` + `probeRest(cfg)`.
 *
 * **IDataProvider alignment (static provider):**
 *   - `start()` → one HTTP fetch; rows arrive as a single
 *     `{ rows, replace: true }` burst, then `status: 'ready'`.
 *   - After `ready`, the transport emits **no further row events**
 *     (maps to `IDataProvider`: no `onTick` — there is no live tail).
 *   - View resync without upstream I/O is `IDataProvider.refresh()`
 *     (hub cache replay). Reload from source is `restart(extra)`.
 *
 * Snapshot-only by nature: `start()` issues one HTTP request, parses
 * rows out of `cfg.rowsPath`, emits them as one
 * `{ rows, replace: true }` event, and flips status to 'ready'.
 * There is no realtime tail — REST endpoints don't push.
 *
 * `restart(extra)` re-issues the request, merging `extra` into the
 * POST body when the body parses as JSON. This is the canonical
 * historical-mode entry point: a date picker writes
 * `{ asOfDate: '2026-04-01' }` into AppData, the resolver fills
 * `cfg.body`, and the user can also pass `{ asOfDate }` as the
 * restart overlay if they want to bypass templates.
 *
 * The container's status surface (loading / ready / error) is the
 * full lifecycle here — there's no streaming complication.
 */

import type { RestProviderConfig } from '@wellsfargo-starui/types';
import type { ProviderEmit, ProviderHandle } from '../Provider.js';

export type RestFetchFn = (input: string, init: RequestInit) => Promise<Response>;

export interface RestOpts {
  /** Inject for tests. */
  fetchImpl?: RestFetchFn;
}

export function startRest(
  cfg: RestProviderConfig,
  emit: ProviderEmit,
  opts: RestOpts = {},
): ProviderHandle {
  const fetchImpl = opts.fetchImpl
    ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);

  const state = { stopped: false, overlay: undefined as Record<string, unknown> | undefined };

  const fetchOnce = async () => {
    if (state.stopped) return;
    if (!fetchImpl) {
      emit({ status: 'error', error: '[RestProvider] no fetch implementation available' });
      return;
    }
    if (!cfg.baseUrl || !cfg.endpoint) {
      emit({ status: 'error', error: '[RestProvider] baseUrl and endpoint are required' });
      return;
    }

    emit({ status: 'loading' });

    const url = buildUrl(cfg);
    const init: RequestInit = {
      method: cfg.method ?? 'GET',
      headers: buildHeaders(cfg),
    };
    if (cfg.method === 'POST') {
      const body = mergeOverlay(cfg.body ?? '', state.overlay);
      if (body) init.body = body;
    }

    let res: Response;
    try {
      res = await fetchImpl(url, init);
    } catch (err) {
      emit({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (state.stopped) return;
    if (!res.ok) {
      emit({ status: 'error', error: `${cfg.method ?? 'GET'} ${url} → ${res.status}` });
      return;
    }
    let body: unknown;
    let bodyText: string;
    try {
      bodyText = await res.text();
    } catch (err) {
      emit({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      return;
    }
    try {
      body = JSON.parse(bodyText);
    } catch {
      emit({ status: 'error', error: 'Failed to parse JSON response' });
      return;
    }
    if (state.stopped) return;

    const rows = extractRows(body, cfg.rowsPath);
    emit({ rows, replace: true });
    emit({ byteSize: bodyText.length });
    emit({ status: 'ready' });
  };

  // Kick off async so listeners attached after startRest() returns
  // see the loading status event.
  void fetchOnce();

  return {
    stop: () => { state.stopped = true; },
    restart: async (extra) => {
      state.overlay = extra;
      // Allow the new fetch to run even if a prior one was in flight;
      // emit a clear-screen replace first so consumers don't keep
      // stale rows during the re-fetch.
      emit({ rows: [], replace: true });
      await fetchOnce();
    },
  };
}

// ─── probeRest() — one-shot snapshot for editor diagnostics ─────────

export interface ProbeResult {
  ok: boolean;
  rows?: readonly unknown[];
  error?: string;
}

export async function probeRest(
  cfg: RestProviderConfig,
  opts: RestOpts = {},
): Promise<ProbeResult> {
  const collected: unknown[] = [];
  let result: ProbeResult | null = null;

  await new Promise<void>((resolve) => {
    const handle = startRest(cfg, (event) => {
      if ('rows' in event && event.rows) {
        for (const r of event.rows) collected.push(r);
      }
      if ('status' in event) {
        if (event.status === 'ready') {
          result = { ok: true, rows: collected };
          void handle.stop();
          resolve();
        }
        if (event.status === 'error') {
          result = { ok: false, error: event.error ?? 'Unknown REST error' };
          void handle.stop();
          resolve();
        }
      }
    }, opts);
  });

  return result ?? { ok: false, error: 'REST probe ended without status' };
}

// ─── helpers ───────────────────────────────────────────────────────

function buildUrl(cfg: RestProviderConfig): string {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const ep = cfg.endpoint.replace(/^\/+/, '');
  let url = `${base}/${ep}`;
  const qp = cfg.queryParams;
  if (qp && Object.keys(qp).length > 0) {
    const qs = new URLSearchParams(qp).toString();
    url += (url.includes('?') ? '&' : '?') + qs;
  }
  return url;
}

function buildHeaders(cfg: RestProviderConfig): Record<string, string> {
  const out: Record<string, string> = { Accept: 'application/json' };
  if (cfg.method === 'POST') out['Content-Type'] = 'application/json';
  if (cfg.headers) Object.assign(out, cfg.headers);
  if (cfg.auth) {
    switch (cfg.auth.type) {
      case 'bearer': out['Authorization'] = `Bearer ${cfg.auth.credentials}`; break;
      case 'apikey': out[cfg.auth.headerName ?? 'X-API-Key'] = cfg.auth.credentials; break;
      case 'basic':  out['Authorization'] = `Basic ${cfg.auth.credentials}`; break;
    }
  }
  return out;
}

function extractRows(body: unknown, rowsPath?: string): unknown[] {
  let cursor: unknown = body;
  if (rowsPath) {
    for (const seg of rowsPath.split('.')) {
      if (cursor && typeof cursor === 'object' && seg in (cursor as Record<string, unknown>)) {
        cursor = (cursor as Record<string, unknown>)[seg];
      } else {
        return [];
      }
    }
  }
  if (!Array.isArray(cursor)) return [];
  return cursor.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null);
}

function mergeOverlay(body: string, overlay: Record<string, unknown> | undefined): string {
  if (!overlay) return body;
  const trimmed = body.trim();
  if (!trimmed) return JSON.stringify(overlay);
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return body;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return body;
  return JSON.stringify({ ...(parsed as Record<string, unknown>), ...overlay });
}
