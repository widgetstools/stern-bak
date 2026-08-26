/**
 * Getting actual rows into the assistant window.
 *
 * The assistant has no grid of its own, so it reads through the SharedWorker
 * data hub — the same hub every open blotter is attached to. When the grid the
 * user is looking at is running, the hub replays its cache and the assistant
 * sees *exactly* the rows on screen, with no upstream fetch.
 *
 * PROVENANCE IS LOAD-BEARING. When the provider isn't running there is a
 * tempting fallback — `probeMock` generates plausible positions offline — but
 * its values are unseeded random, so a summary of them describes numbers the
 * user has never seen. That is worse than no answer. So the source travels with
 * the rows, every caller has to handle it, and the tool result says which one
 * it was in words the model is told to repeat.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';
import { probeMock } from '@wellsfargo-starui/data';
import { gridScopeId } from './gridProfiles';
import type { MockProviderConfig, ProviderConfig } from '@wellsfargo-starui/types';

/** Minimal shape this module needs from `useDataServices().client`. */
export interface DataHubClient {
  isProviderRunning(providerId: string): Promise<boolean>;
  subscribe<T = unknown>(
    providerId: string,
    cfg: ProviderConfig | undefined,
    opts?: Record<string, unknown>,
  ): {
    snapshot: Promise<readonly T[]>;
    unsubscribe(): void;
  };
}

export type RowSource = 'live' | 'sample';

export interface RowSet {
  rows: Array<Record<string, unknown>>;
  source: RowSource;
  providerId: string;
  providerName?: string;
  /** One sentence naming where these rows came from, for the tool result. */
  provenance: string;
}

export type RowFetch = { ok: true; value: RowSet } | { ok: false; error: string };

const SNAPSHOT_TIMEOUT_MS = 8_000;
const SAMPLE_ROWS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A snapshot that never resolves would hang the tool call and the turn. */
async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Rows for a grid, preferring what the user is actually looking at.
 *
 * Deliberately does NOT start a provider that isn't running: subscribing would
 * open a STOMP socket or issue an upstream request as a side effect of a
 * question, and the rows still wouldn't be the ones on screen — because there
 * is no screen.
 */
export async function fetchGridRows(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  entry: RegistryEntry,
  client: DataHubClient | undefined,
  opts: { allowSample?: boolean } = {},
): Promise<RowFetch> {
  const gridLevelData = (await configManager.profiles.loadGridLevelData({ instanceId: gridScopeId(entry) })) as
    | { provider?: { liveProviderId?: string } }
    | null;
  const providerId = gridLevelData?.provider?.liveProviderId;
  if (!providerId) {
    return {
      ok: false,
      error: `Grid "${entry.displayName}" has no data provider bound, so there is nothing to summarize. Bind one with set_grid_provider.`,
    };
  }

  const config = await configStore.get(providerId);
  const providerName = config?.name;

  if (client) {
    const running = await client.isProviderRunning(providerId).catch(() => false);
    if (running) {
      try {
        const handle = client.subscribe(providerId, undefined);
        try {
          const snapshot = await withTimeout(handle.snapshot, SNAPSHOT_TIMEOUT_MS, 'Snapshot');
          return {
            ok: true,
            value: {
              rows: snapshot.filter(isRecord).map((row) => ({ ...row })),
              source: 'live',
              providerId,
              providerName,
              provenance: `live from "${providerName ?? providerId}" — the rows currently on screen`,
            },
          };
        } finally {
          // Read-only: never leave a subscription behind holding the provider up.
          handle.unsubscribe();
        }
      } catch (err) {
        return { ok: false, error: `Couldn't read live rows from "${providerName ?? providerId}": ${(err as Error).message}` };
      }
    }
  }

  // Not running (or no hub in this window). A generated sample is only ever
  // offered for mock feeds, and only when the caller opted in.
  const providerType = (config?.config as ProviderConfig | undefined)?.providerType ?? config?.providerType;
  if (opts.allowSample && providerType === 'mock') {
    const mock = (config?.config ?? { providerType: 'mock', dataType: 'positions' }) as MockProviderConfig;
    const { rows } = probeMock(mock, { maxRows: SAMPLE_ROWS });
    return {
      ok: true,
      value: {
        rows: rows.filter(isRecord).map((row) => ({ ...row })),
        source: 'sample',
        providerId,
        providerName,
        provenance:
          `a freshly GENERATED sample of ${rows.length} mock rows — "${providerName ?? providerId}" is not running, ` +
          'so these are NOT the numbers the user has on screen and the values differ on every call',
      },
    };
  }

  return {
    ok: false,
    error:
      `"${providerName ?? providerId}" isn't streaming right now, so there are no rows to read. ` +
      'Open the blotter and ask again — the assistant reads the same live feed the open window does.' +
      (providerType === 'mock' ? ' Or pass allowSample:true to describe a generated sample instead (not the user\'s data).' : ''),
  };
}
