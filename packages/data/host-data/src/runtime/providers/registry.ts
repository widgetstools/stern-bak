/**
 * Provider registry — maps `cfg.providerType` → factory function.
 *
 * Each entry is just a `(cfg, emit) => ProviderHandle`. Adding a new
 * transport is one file with one function plus one line here. No
 * abstract base class, no descriptor pattern (3 plugins doesn't earn
 * it — descriptors pay off at 8+).
 */

import type { ProviderConfig, StompProviderConfig, StompSsrmProviderConfig } from '@wellsfargo-starui/types';
import type { ProviderEmit, ProviderHandle } from './Provider.js';
import { resolveBracketCfg, type BracketCache } from '../template/bracketResolver.js';
import { assertAppDataResolved, resolveCfg, type AppDataLookup } from '../template/resolver.js';
import { startMock } from './transports/mock.js';
import { startStomp } from './transports/stomp.js';
import { startRest } from './transports/rest.js';

export type ProviderFactory<T extends ProviderConfig = ProviderConfig> = (
  cfg: T,
  emit: ProviderEmit,
) => ProviderHandle;

const factories: Partial<Record<ProviderConfig['providerType'], ProviderFactory>> = {
  mock: startMock as ProviderFactory,
  stomp: startStomp as ProviderFactory,
  /** Same STOMP transport; hub attaches an SSRM query plane separately. */
  'stomp-ssrm': startStomp as ProviderFactory,
  rest: startRest as ProviderFactory,
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

  if (cfg.providerType === 'stomp' || cfg.providerType === 'stomp-ssrm') {
    return startStomp(bracketResolved as StompProviderConfig | StompSsrmProviderConfig, emit, {
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
