import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PROVIDER_TYPES, WIRE_STOMP_STEPS } from '../../knowledge/platform.js';

export function handleListProviderTypes() {
  return { providers: PROVIDER_TYPES, wireStompSteps: WIRE_STOMP_STEPS };
}

export function handleGenerateStompConfig(opts: {
  clientTag?: string;
  dataType?: 'positions' | 'trades' | 'orders' | 'custom';
  websocketUrl?: string;
  port?: number;
  keyColumn?: string;
  name?: string;
}) {
  const tag = opts.clientTag ?? 'TRADER001';
  const port = opts.port ?? 8081;
  const ws = opts.websocketUrl ?? `ws://localhost:${port}`;
  const dataType = opts.dataType ?? 'positions';
  const keyColumn = opts.keyColumn ?? (dataType === 'positions' ? 'positionId' : 'id');

  const stompConfig = {
    providerType: 'stomp' as const,
    websocketUrl: ws,
    listenerTopic: `/snapshot/${dataType}/${tag}`,
    requestMessage: `/snapshot/${dataType}/${tag}/1000/50`,
    requestBody: '',
    snapshotEndToken: 'Success',
    snapshotTimeoutMs: 60_000,
    dataType,
    keyColumn,
    autoStart: false,
  };

  const draft = {
    name: opts.name ?? `STOMP ${dataType} (${tag})`,
    description: `Snapshot + live deltas from stomp-view-server`,
    providerType: 'stomp',
    public: false,
    config: stompConfig,
  };

  const ensureSnippet = `import { DataProviderConfigStore } from '@wellsfargo-starui/host-data/runtime';
import type { DataProviderConfig } from '@wellsfargo-starui/types';
import { useDataServices, useUserIdFromContext } from '@wellsfargo-starui/host-data-react/runtime';
import { positionsProviderDraft } from './providers/positionsStomp';

export async function ensureStompProvider(
  configStore: DataProviderConfigStore,
  userId: string,
): Promise<string> {
  const existing = (await configStore.list(userId, { subtype: 'stomp' }))
    .find((p: DataProviderConfig) => p.name === positionsProviderDraft.name);
  if (existing?.providerId) return existing.providerId;
  const saved = await configStore.save(positionsProviderDraft, userId);
  if (!saved.providerId) throw new Error('Provider save did not return providerId');
  return saved.providerId;
}

// In App.tsx (inside DataHubProvider):
// const { configStore } = useDataServices();
// const userId = useUserIdFromContext();
// await ensureStompProvider(configStore, userId);
`;

  return { stompConfig, dataProviderConfig: draft, ensureStompProviderSnippet: ensureSnippet };
}

export function handleValidateProviderConfig(config: Record<string, unknown>) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const type = config.providerType ?? (config.config as Record<string, unknown>)?.providerType;

  if (type === 'stomp' || config.websocketUrl) {
    const c = (config.config ?? config) as Record<string, unknown>;
    if (!c.websocketUrl) errors.push('websocketUrl is required');
    if (!c.listenerTopic) errors.push('listenerTopic is required');
    if (!c.keyColumn) warnings.push('keyColumn recommended for delta upserts');
    if (String(c.websocketUrl ?? '').startsWith('http')) errors.push('websocketUrl must be ws:// or wss://');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function handleAddProviderToProject(opts: {
  projectDir: string;
  providerType: 'stomp' | 'mock';
  clientTag?: string;
}) {
  if (opts.providerType === 'stomp') {
    const gen = handleGenerateStompConfig({ clientTag: opts.clientTag });
    const providersDir = join(opts.projectDir, 'src/providers');
    mkdirSync(providersDir, { recursive: true });
    writeFileSync(
      join(providersDir, 'positionsStomp.ts'),
      `import type { DataProviderConfig } from '@wellsfargo-starui/types';\n\nexport const positionsProviderDraft: DataProviderConfig = ${JSON.stringify(gen.dataProviderConfig, null, 2)};\n`,
      'utf8',
    );
    writeFileSync(join(opts.projectDir, 'src/ensureStompProvider.ts'), gen.ensureStompProviderSnippet, 'utf8');
    return {
      written: ['src/providers/positionsStomp.ts', 'src/ensureStompProvider.ts'],
      next: 'Call ensureStompProvider() in App useEffect before rendering HostedMarketsGrid',
    };
  }

  const mockSnippet = join(opts.projectDir, 'src/mockProviderConfig.ts');
  writeFileSync(
    mockSnippet,
    `export const mockPositionsCfg = {
  dataType: 'positions' as const,
  rowCount: 200,
  updateIntervalMs: 500,
  enableUpdates: true,
};
`,
    'utf8',
  );
  return { written: [mockSnippet], next: 'useProviderStream("mock-positions", mockPositionsCfg, { onDelta })' };
}

export async function handleTestStompConnection(opts: { websocketUrl?: string; port?: number }) {
  const port = opts.port ?? 8081;
  const wsUrl = opts.websocketUrl ?? `ws://localhost:${port}`;
  const healthUrl = wsUrl.replace(/^ws/, 'http').replace(/\/$/, '') + '/health';

  let health: { ok: boolean; detail?: string } = { ok: false };
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
    health = { ok: res.ok, detail: await res.text() };
  } catch (err) {
    health = { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }

  let wsOpen = false;
  let wsError: string | undefined;
  if (typeof WebSocket !== 'undefined') {
    try {
      wsOpen = await new Promise<boolean>((resolve) => {
        const ws = new WebSocket(wsUrl);
        const t = setTimeout(() => {
          ws.close();
          resolve(false);
        }, 3000);
        ws.onopen = () => {
          clearTimeout(t);
          ws.close();
          resolve(true);
        };
        ws.onerror = () => {
          clearTimeout(t);
          resolve(false);
        };
      });
    } catch (err) {
      wsError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    healthUrl,
    health,
    websocketUrl: wsUrl,
    websocketConnects: wsOpen,
    wsError,
    hint: health.ok ? 'Server up — use starui_generate_stomp_config then select provider in grid toolbar' : 'Start stomp-view-server: npm run dev:stomp',
  };
}

export function handleExplainProviderToolbar() {
  return {
    shortcuts: {
      winLinux: 'Alt+Shift+P',
      mac: 'Cmd+Shift+P or Option+Shift+P',
    },
    steps: [
      'Open provider toolbar via keyboard shortcut or grid chrome',
      'Choose Live vs Historical mode if AppData date keys configured',
      'Select a saved provider (STOMP Positions local, etc.)',
      'Grid subscribes via SharedWorker → snapshot then deltas',
    ],
    gridLevelData: 'Persisted picker state in ConfigManager / localStorage under gridLevelData',
    eagerHydration: 'Set dataServicesMode="eager" when using {{positions.asOfDate}} templates',
  };
}

export function handleProviderConfigFromCsv(opts: { csvHeaderLine: string; dataType?: string }) {
  const headers = opts.csvHeaderLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const keyColumn = headers.find((h) => /id$/i.test(h)) ?? headers[0];
  const columnDefinitions = headers.map((field) => ({
    field,
    headerName: field,
    filter: true,
  }));

  const config = handleGenerateStompConfig({
    dataType: (opts.dataType as 'positions') ?? 'positions',
    keyColumn,
  });

  return {
    ...config,
    columnDefinitions,
    inferredKeyColumn: keyColumn,
    csvHeaders: headers,
  };
}
