import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function handleExplainComponentRegistration() {
  return {
    flow: [
      'seed-config.json appRegistry registers the platform app',
      'manifest.fin.json lists dock apps and provider URL',
      '/platform/provider route calls initWorkspace()',
      'View routes wrap content in StarGridApp (runtime + ConfigManager)',
      '/blotters/marketsgrid lazy-loads BlottersMarketsGrid',
      'HostedMarketsGrid componentName + defaultInstanceId + withStorage → profile key',
    ],
    profileKey: '(appId, userId, instanceId) in ConfigManager',
    files: [
      'public/platform/manifest.fin.json',
      'public/seed-config.json',
      'src/main.tsx',
      'src/platform/Provider.tsx',
      'src/views/BlottersMarketsGrid.tsx',
      'launch.mjs',
    ],
  };
}

export function handleAddBlotterRoute(opts: {
  projectDir: string;
  routePath: string;
  gridId: string;
  componentName: string;
}) {
  const viewName = opts.gridId.replace(/[^a-zA-Z0-9]/g, '');
  const viewFile = join(opts.projectDir, 'src/views', `${viewName}Blotter.tsx`);
  const content = `/**
 * Route ${opts.routePath} — HostedMarketsGrid blotter.
 * Registered via react-router in main.tsx; componentName="${opts.componentName}" for ConfigManager.
 */
import { HostedMarketsGrid } from '@wellsfargo-starui/widgets-react/hosted';
import { getPlatform } from '../platformBootstrap';

export default function ${viewName}Blotter() {
  const { configManager } = getPlatform();
  return (
    <HostedMarketsGrid
      componentName="${opts.componentName}"
      defaultInstanceId="${opts.gridId}"
      gridId="${opts.gridId}"
      withStorage
      theme="auto"
      configManager={configManager}
      showFiltersToolbar
      showFormattingToolbar
    />
  );
}
`;
  mkdirSync(join(opts.projectDir, 'src/views'), { recursive: true });
  writeFileSync(viewFile, content, 'utf8');
  return {
    written: viewFile,
    nextSteps: [
      `Add lazy route in main.tsx: path="${opts.routePath}" element={<${viewName}Blotter />}`,
      'Register view in manifest.fin.json apps[] if launching from dock',
    ],
  };
}

export function handleGenerateViewManifest(opts: {
  viewUrl: string;
  title: string;
  fdc3ContextGroup?: string;
}) {
  return {
    manifest: {
      url: opts.viewUrl,
      name: opts.title,
      fdc3InteropApi: '2.0',
      customData: {
        contextGroup: opts.fdc3ContextGroup ?? 'green',
      },
    },
    path: `public/views/${opts.title.toLowerCase().replace(/\s+/g, '-')}.fin.json`,
  };
}

export async function handleOpenfinLaunchChecklist(opts: { projectDir: string; port?: number }) {
  const port = opts.port ?? 5174;
  const checks: Array<{ name: string; ok: boolean; fix?: string }> = [];

  checks.push({
    name: 'launch.mjs exists',
    ok: existsSync(join(opts.projectDir, 'launch.mjs')),
    fix: 'Scaffold openfin-platform template',
  });
  checks.push({
    name: 'platform manifest',
    ok: existsSync(join(opts.projectDir, 'public/platform/manifest.fin.json')),
  });
  checks.push({
    name: 'Provider.tsx',
    ok: existsSync(join(opts.projectDir, 'src/platform/Provider.tsx')),
  });

  let viteUp = false;
  try {
    const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(2000) });
    viteUp = res.ok;
  } catch {
    viteUp = false;
  }
  checks.push({
    name: `Vite dev server :${port}`,
    ok: viteUp,
    fix: `npm run dev (expect port ${port})`,
  });

  return {
    checks,
    launchCommand: `node launch.mjs http://localhost:${port}/platform/manifest.fin.json`,
    ready: checks.every((c) => c.ok),
  };
}
