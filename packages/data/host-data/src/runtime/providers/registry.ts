/**
 * Provider registry — maps `cfg.providerType` → factory function.
 *
 * Each entry is just a `(cfg, emit) => ProviderHandle`. Adding a new
 * transport is one file with one function plus one line here. No
 * abstract base class, no descriptor pattern (3 plugins doesn't earn
 * it — descriptors pay off at 8+).
 */

import type {
  MockPerspectiveProviderConfig,
  ProviderConfig,
  StompPerspectiveProviderConfig,
  StompProviderConfig,
} from '@wellsfargo-starui/types';
import type { ProviderEmit, ProviderHandle } from './Provider.js';
import { resolveBracketCfg, type BracketCache } from '../template/bracketResolver.js';
import { assertAppDataResolved, resolveCfg, type AppDataLookup } from '../template/resolver.js';
import { startMock } from './transports/mock.js';
import { startStomp } from './transports/stomp.js';
import { startRest } from './transports/rest.js';
import { startStompPerspective } from './transports/stompPerspective.js';
import { startMockPerspective } from './transports/mockPerspective.js';
import type { PerspectiveHost } from '../perspective/perspectiveHost.js';

export type ProviderFactory<T extends ProviderConfig = ProviderConfig> = (
  cfg: T,
  emit: ProviderEmit,
) => ProviderHandle;

const factories: Partial<Record<ProviderConfig['providerType'], ProviderFactory>> = {
  mock: startMock as ProviderFactory,
  stomp: startStomp as ProviderFactory,
  rest: startRest as ProviderFactory,
  'stomp-perspective': startStompPerspective as ProviderFactory,
  'mock-perspective': startMockPerspective as ProviderFactory,
};

/**
 * Resolve and start a provider for the given config. Throws if the
 * provider type isn't registered (rather than silently no-op).
 *
 * Mints a fresh per-attach `BracketCache` and resolves any
 * `[identifier]` tokens in the config before dispatch — two
 * occurrences of the same token name (e.g. `[clientTag]`) across
 * different config fields share the same session-unique value for
 * the lifetime of this provider attach. The cache is discarded once
 * dispatch completes; the factory only sees resolved strings.
 *
 * `[identifier]` bracket tokens are resolved here. When `appDataLookup`
 * is supplied (SharedWorker hub), `{{name.key}}` tokens are also
 * resolved — STOMP re-applies AppData on every connect/restart.
 */
export interface StartProviderOpts {
  appDataLookup?: AppDataLookup;
  /**
   * The worker's Perspective host, used by the `*-perspective` providers.
   * Injected so a worker that never opens a blotter does not pull in the
   * engine's wasm. Without it those providers still run — they just serve the
   * push path only.
   */
  perspectiveHost?: PerspectiveHost;
  /**
   * Name the Table is hosted under, for the `*-perspective` providers.
   *
   * Supplied by the hub as the provider id — the contract
   * `StompPerspectiveProviderConfig.tableName` documents ("defaults to the
   * provider id, which is what makes one Table per provider") but which no
   * transport can implement, because a transport is handed a cfg and never an
   * id. Its own fallback is the literal `'positions'`, so without this every
   * Table-hosting provider in a worker names its Table the same thing.
   * `cfg.tableName` still wins over it.
   */
  tableName?: string;
}

export function startProvider(
  cfg: ProviderConfig,
  emit: ProviderEmit,
  opts?: StartProviderOpts,
): ProviderHandle {
  const factory = factories[cfg.providerType];
  if (!factory) {
    throw new Error(`[data-services] No provider factory registered for type '${cfg.providerType}'`);
  }
  const bracketCache: BracketCache = new Map();
  const bracketResolved = resolveBracketCfg(cfg, bracketCache);

  if (cfg.providerType === 'stomp-perspective') {
    // Same AppData/bracket treatment as `stomp` — it IS a STOMP config —
    // plus the host the Table is created on.
    const stompPerspectiveCfg = bracketResolved as StompPerspectiveProviderConfig;
    return startStompPerspective(stompPerspectiveCfg, emit, {
      appDataLookup: opts?.appDataLookup,
      perspectiveHost: opts?.perspectiveHost,
      tableName: stompPerspectiveCfg.tableName ?? opts?.tableName,
    });
  }

  if (cfg.providerType === 'mock-perspective') {
    // An override registered through `registerProvider` must still win, or
    // this branch would silently make that documented escape hatch a no-op
    // for this type — which is exactly how a test that installs its own
    // factory ends up asserting against the built-in one.
    const registered = factories['mock-perspective'];
    if (registered && registered !== (startMockPerspective as ProviderFactory)) {
      return registered(bracketResolved, emit);
    }
    // Same treatment as `mock` — it IS a mock config — plus the host the
    // Table is created on. No AppData resolution: the generator takes no
    // connection settings, so there is nothing for a token to appear in.
    const mockPerspectiveCfg = bracketResolved as MockPerspectiveProviderConfig;
    return startMockPerspective(mockPerspectiveCfg, emit, {
      perspectiveHost: opts?.perspectiveHost,
      tableName: mockPerspectiveCfg.tableName ?? opts?.tableName,
    });
  }

  if (cfg.providerType === 'stomp') {
    return startStomp(bracketResolved as StompProviderConfig, emit, {
      appDataLookup: opts?.appDataLookup,
    });
  }

  let resolved = bracketResolved;
  if (opts?.appDataLookup) {
    resolved = resolveCfg(resolved, opts.appDataLookup);
    const unresolved = assertAppDataResolved(resolved, `[data-services] ${cfg.providerType} provider cfg`);
    if (unresolved) {
      throw new Error(unresolved);
    }
  }
  return factory(resolved, emit);
}

/**
 * Allow apps to register their own factories (or override the
 * defaults — useful for testing). Idempotent: last registration
 * wins.
 */
export function registerProvider<T extends ProviderConfig>(
  type: T['providerType'],
  factory: ProviderFactory<T>,
): void {
  factories[type] = factory as ProviderFactory;
}
