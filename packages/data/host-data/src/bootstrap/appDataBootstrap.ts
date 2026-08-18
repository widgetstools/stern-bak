import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { AppDataConfig } from '../runtime/providers/appdata/store.js';
import type { AppDataMirror } from '../runtime/mirror/AppDataMirror.js';
import type { AppDataBootstrapManifest } from './PlatformBootstrapConfig.js';

export interface AppDataUpsertInput {
  configId?: string;
  name: string;
  description?: string;
  isPublic?: boolean;
  values: Record<string, unknown>;
  userId?: string;
}

export interface AppDataBootstrapContext {
  appId: string;
  userId: string;
  appData: AppDataMirror;
  configManager: ConfigManager;
  upsertAppData(input: AppDataUpsertInput): Promise<void>;
  fetchJson<T>(url: string, init?: RequestInit): Promise<T>;
  log(message: string, detail?: unknown): void;
}

export type AppDataBootstrapHook = (ctx: AppDataBootstrapContext) => void | Promise<void>;
export type AppDataBootstrapHookRegistry = Record<string, AppDataBootstrapHook>;

export interface RunAppDataBootstrapOpts {
  manifest: AppDataBootstrapManifest;
  registry: AppDataBootstrapHookRegistry;
  appId: string;
  userId: string;
  appData: AppDataMirror;
  configManager: ConfigManager;
  /** When true, hook failures reject the overall run. Default false. */
  strict?: boolean;
  onError?: (hookId: string, err: unknown) => void;
  fetchJson?: <T>(url: string, init?: RequestInit) => Promise<T>;
}

const SESSION_KEY_PREFIX = 'starui:appDataBootstrap:';

function sessionStorageKey(appId: string, userId: string, hookId: string): string {
  return `${SESSION_KEY_PREFIX}${appId}:${userId}:${hookId}`;
}

function providerHasValues(appData: AppDataMirror, providerName: string): boolean {
  const row = appData.list().find((r) => r.name === providerName);
  if (!row) return false;
  return Object.keys(row.values).length > 0;
}

function shouldSkipHook(
  hookId: string,
  manifest: AppDataBootstrapManifest,
  appData: AppDataMirror,
  appId: string,
  userId: string,
): boolean {
  const policy = manifest.runPolicy ?? 'if-missing';

  if (policy === 'once-per-session') {
    try {
      if (sessionStorage.getItem(sessionStorageKey(appId, userId, hookId)) === '1') {
        return true;
      }
    } catch {
      // sessionStorage unavailable — run hook
    }
  }

  if (policy === 'if-missing') {
    const targets = manifest.targets?.[hookId] ?? [];
    if (targets.length === 0) return false;
    return targets.every((name) => providerHasValues(appData, name));
  }

  return false;
}

function markHookRan(appId: string, userId: string, hookId: string, policy: AppDataBootstrapManifest['runPolicy']): void {
  if (policy !== 'once-per-session') return;
  try {
    sessionStorage.setItem(sessionStorageKey(appId, userId, hookId), '1');
  } catch {
    // ignore
  }
}

export function createAppDataBootstrapContext(
  opts: Pick<RunAppDataBootstrapOpts, 'appId' | 'userId' | 'appData' | 'configManager' | 'fetchJson'>,
): AppDataBootstrapContext {
  const fetchJson = opts.fetchJson ?? (async <T>(url: string, init?: RequestInit) => {
    const res = await fetch(url, init);
    if (!res.ok) {
      throw new Error(`fetchJson failed (${res.status}): ${url}`);
    }
    return res.json() as Promise<T>;
  });

  return {
    appId: opts.appId,
    userId: opts.userId,
    appData: opts.appData,
    configManager: opts.configManager,
    fetchJson,
    log(message, detail) {
      if (detail !== undefined) {
         
        console.info(`[@wellsfargo-starui/data appDataBootstrap] ${message}`, detail);
      } else {
         
        console.info(`[@wellsfargo-starui/data appDataBootstrap] ${message}`);
      }
    },
    async upsertAppData(input: AppDataUpsertInput): Promise<void> {
      const existing = opts.appData.list().find((r) => r.name === input.name);
      const config: AppDataConfig = {
        configId: input.configId ?? existing?.configId ?? '',
        name: input.name,
        description: input.description ?? existing?.description,
        isPublic: input.isPublic ?? existing?.isPublic ?? false,
        values: input.values,
        userId: input.userId ?? existing?.userId ?? opts.userId,
      };
      await opts.appData.upsertConfig(config);
    },
  };
}

export async function runAppDataBootstrap(opts: RunAppDataBootstrapOpts): Promise<void> {
  const { manifest, registry, appId, userId, appData, configManager } = opts;
  const ctx = createAppDataBootstrapContext(opts);
  const policy = manifest.runPolicy ?? 'if-missing';

  const hookIds = [
    ...(manifest.onHubReady ?? []),
    ...(manifest.onUserChange ?? []),
  ];

  for (const hookId of hookIds) {
    const hook = registry[hookId];
    if (!hook) {
      ctx.log(`skipping unknown hook id "${hookId}"`);
      continue;
    }
    if (shouldSkipHook(hookId, manifest, appData, appId, userId)) {
      ctx.log(`skipping hook "${hookId}" (${policy})`);
      continue;
    }
    try {
      await hook(ctx);
      markHookRan(appId, userId, hookId, policy);
    } catch (err) {
      opts.onError?.(hookId, err);
      ctx.log(`hook "${hookId}" failed`, err);
      if (opts.strict) throw err;
    }
  }
}
