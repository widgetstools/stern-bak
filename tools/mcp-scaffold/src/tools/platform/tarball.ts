import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  buildPackageDeps,
  readManifest,
  resolveTarballs,
} from '../../lib/tarballResolver.js';
import { BUCKET_GRAPH, IMPORT_ALIAS_MAP } from '../../knowledge/platform.js';
import { getTemplate } from '../../lib/templateCatalog.js';

export async function handleCheckTarballVersions(opts: { projectDir: string; staruiRoot?: string }) {
  const libsDir = join(opts.projectDir, 'libs');
  if (!existsSync(join(libsDir, 'manifest.json'))) {
    return { error: 'No libs/manifest.json — not a tarball consumer app' };
  }
  const local = readManifest(join(libsDir, 'manifest.json'));
  const staruiRoot = opts.staruiRoot ?? process.env.STARUI_ROOT;
  if (!staruiRoot) {
    return { local, remote: null, note: 'Set STARUI_ROOT to compare against latest propagate output' };
  }
  const remoteDir = join(staruiRoot, 'libs');
  const remote = existsSync(join(remoteDir, 'manifest.json'))
    ? readManifest(join(remoteDir, 'manifest.json'))
    : null;
  const drift: string[] = [];
  if (remote) {
    for (const [key, entry] of Object.entries(local)) {
      const remoteEntry = remote[key];
      if (!remoteEntry) drift.push(`${key}: missing in remote`);
      else if (remoteEntry.sha !== entry.sha) drift.push(`${key}: ${entry.filename} → ${remoteEntry.filename}`);
    }
  }
  return { drift, stale: drift.length > 0, local, remote };
}

export async function handleRefreshLibs(opts: { projectDir: string; staruiRoot?: string }) {
  const libsDir = join(opts.projectDir, 'libs');
  const bundle = await resolveTarballs({
    outputLibsDir: libsDir,
    buckets: Object.keys(BUCKET_GRAPH),
    staruiRoot: opts.staruiRoot ?? process.env.STARUI_ROOT,
  });
  const manifest = readManifest(bundle.manifestPath);
  const pkgPath = join(opts.projectDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { dependencies?: Record<string, string> };
  const template = getTemplate('stomp');
  const buckets = template?.buckets ?? Object.keys(BUCKET_GRAPH);
  const deps = buildPackageDeps(manifest, buckets);
  pkg.dependencies = { ...pkg.dependencies, ...deps };
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  return { refreshed: bundle.tarballs.map((t) => t.filename), source: bundle.source, warnings: bundle.warnings };
}

export function handleExplainImportAlias(importPath?: string) {
  if (importPath) {
    const entry = IMPORT_ALIAS_MAP[importPath];
    if (!entry) return { error: `Unknown import: ${importPath}`, known: Object.keys(IMPORT_ALIAS_MAP) };
    return entry;
  }
  return { aliases: IMPORT_ALIAS_MAP };
}

export function handleBucketDependencyGraph(templateId?: string) {
  const template = templateId ? getTemplate(templateId) : undefined;
  return {
    graph: BUCKET_GRAPH,
    templateBuckets: template?.buckets ?? null,
    note: 'Install tarballs for each bucket in template; vite aliases resolve member imports.',
  };
}
