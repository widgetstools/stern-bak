#!/usr/bin/env node
/** Copy templates/ next to dist/ so runtime resolves from package root. */
import { cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(pkgRoot, 'templates');
const dest = join(pkgRoot, 'dist', 'templates');

if (existsSync(src)) {
  cpSync(src, dest, { recursive: true });
}
