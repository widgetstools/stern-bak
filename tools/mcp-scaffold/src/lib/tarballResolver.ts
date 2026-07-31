import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundledLibsDir } from './paths.js';

export interface TarballEntry {
  bucket: string;
  filename: string;
  absolutePath: string;
}

export interface TarballBundle {
  manifestPath: string;
  tarballs: TarballEntry[];
  source: 'propagate' | 'bundled' | 'path';
  warnings: string[];
}

export interface LibsManifest {
  [bucketKey: string]: {
    bucket: string;
    members: string[];
    filename: string;
    version: string;
    sha: string;
  };
}

/** npm dependency key → libs manifest bucket key */
export const BUCKET_DEP_NAMES: Record<string, string> = {
  '@wellsfargo-starui/design-system': '@wellsfargo-starui/design-system',
  '@wellsfargo-starui/react-ui': '@wellsfargo-starui/react-ui',
  '@wellsfargo-starui/react-grid': '@wellsfargo-starui/react-grid',
  '@wellsfargo-starui/shared': '@wellsfargo-starui/shared',
  '@wellsfargo-starui/data': '@wellsfargo-starui/data',
  '@wellsfargo-starui/react-core': '@wellsfargo-starui/react-core',
  '@wellsfargo-starui/openfin': '@wellsfargo-starui/openfin',
};

export function readManifest(manifestPath: string): LibsManifest {
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as LibsManifest;
}

export function buildPackageDeps(manifest: LibsManifest, buckets: string[]): Record<string, string> {
  const deps: Record<string, string> = {};
  for (const bucket of buckets) {
    const key = bucket.startsWith('@wellsfargo-starui/') ? bucket : `@wellsfargo-starui/${bucket}`;
    const entry = manifest[key];
    if (!entry) continue;
    const depName = BUCKET_DEP_NAMES[key] ?? key;
    deps[depName] = `file:libs/${entry.filename}`;
  }
  return deps;
}

function copyLibsFromDir(sourceDir: string, destDir: string): TarballBundle {
  mkdirSync(destDir, { recursive: true });
  const manifestPath = join(sourceDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in ${sourceDir}`);
  }
  const manifest = readManifest(manifestPath);
  copyFileSync(manifestPath, join(destDir, 'manifest.json'));

  const tarballs: TarballEntry[] = [];
  for (const file of readdirSync(sourceDir)) {
    if (!file.endsWith('.tgz')) continue;
    const src = join(sourceDir, file);
    const dest = join(destDir, file);
    copyFileSync(src, dest);
    const bucketKey = Object.entries(manifest).find(([, v]) => v.filename === file)?.[0] ?? file;
    tarballs.push({ bucket: bucketKey, filename: file, absolutePath: dest });
  }
  return { manifestPath: join(destDir, 'manifest.json'), tarballs, source: 'path', warnings: [] };
}

export async function resolveTarballs(opts: {
  outputLibsDir: string;
  buckets: string[];
  staruiRoot?: string;
  tarballSource?: string;
}): Promise<TarballBundle> {
  const warnings: string[] = [];
  mkdirSync(opts.outputLibsDir, { recursive: true });

  if (opts.staruiRoot && existsSync(join(opts.staruiRoot, 'package.json'))) {
    try {
      execSync('npm run propagate -- --skip-drift-check', {
        cwd: opts.staruiRoot,
        stdio: 'pipe',
        env: { ...process.env, FORCE_COLOR: '0' },
      });
      const libsDir = join(opts.staruiRoot, 'libs');
      const result = copyLibsFromDir(libsDir, opts.outputLibsDir);
      result.source = 'propagate';
      return result;
    } catch (err) {
      warnings.push(`propagate failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (opts.tarballSource && existsSync(opts.tarballSource)) {
    const result = copyLibsFromDir(opts.tarballSource, opts.outputLibsDir);
    result.warnings = warnings;
    return result;
  }

  const bundled = bundledLibsDir();
  if (existsSync(join(bundled, 'manifest.json'))) {
    const result = copyLibsFromDir(bundled, opts.outputLibsDir);
    result.source = 'bundled';
    result.warnings = [
      ...warnings,
      'Using bundled StarUI tarballs — set STARUI_ROOT for latest from your checkout.',
    ];
    return result;
  }

  throw new Error(
    'No StarUI tarballs available. Set STARUI_ROOT to a starui monorepo, STARUI_TARBALL_SOURCE to a libs/ path, or run npm run pack:mcp to bundle tarballs.',
  );
}

export function copyTree(src: string, dest: string, skip = new Set(['node_modules', '.git'])): void {
  cpSync(src, dest, {
    recursive: true,
    filter: (path) => {
      const parts = path.split('/');
      return !parts.some((p) => skip.has(p));
    },
  });
}
