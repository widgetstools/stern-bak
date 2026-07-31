import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findPackageRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
        if (pkg.name === '@wellsfargo-starui/mcp-scaffold') return dir;
      } catch {
        /* continue */
      }
    }
    dir = dirname(dir);
  }
  return join(__dirname, '..', '..');
}

const PKG_ROOT = findPackageRoot();

export function packageRoot(): string {
  return PKG_ROOT;
}

export function templatesDir(): string {
  const distTemplates = join(PKG_ROOT, 'dist', 'templates');
  if (existsSync(distTemplates)) return distTemplates;
  return join(PKG_ROOT, 'templates');
}

export function bundledLibsDir(): string {
  return join(PKG_ROOT, 'bundled-libs');
}

export function stompServerSourceDir(staruiRoot?: string): string | null {
  if (staruiRoot) {
    const p = join(staruiRoot, 'apps', 'stomp-view-server');
    if (existsSync(p)) return p;
  }
  const monorepoGuess = join(PKG_ROOT, '..', '..', 'apps', 'stomp-view-server');
  if (existsSync(monorepoGuess)) return monorepoGuess;
  return join(templatesDir(), 'static', 'stomp-view-server');
}

export function gridConfigLayoutsSource(staruiRoot?: string): string | null {
  if (staruiRoot) {
    const p = join(staruiRoot, 'apps', 'grid-config');
    if (existsSync(p)) return p;
  }
  const monorepoGuess = join(PKG_ROOT, '..', '..', 'apps', 'grid-config');
  if (existsSync(monorepoGuess)) return monorepoGuess;
  const bundled = join(templatesDir(), 'resources', 'layout-packs');
  if (existsSync(bundled)) return bundled;
  return null;
}

export function consumerScriptsSourceDir(staruiRoot?: string): string {
  if (staruiRoot) {
    return join(staruiRoot, 'scripts');
  }
  return join(PKG_ROOT, '..', '..', 'scripts');
}
