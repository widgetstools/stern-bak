#!/usr/bin/env node
/**
 * Launch this demo in OpenFin Runtime.
 *
 *   npm run openfin --workspace=@wellsfargo-starui/demo-stomp-markets-grid
 *   # or from repo root (with dev server on :5210):
 *   node apps/demos/demo-stomp-markets-grid/launch.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestUrl = process.argv[2] ?? 'http://localhost:5210/platform/manifest.fin.json';
const launcher = join(repoRoot, 'tools/scripts/launch-openfin.mjs');

const child = spawn(process.execPath, [launcher, manifestUrl], {
  stdio: 'inherit',
  cwd: repoRoot,
});

child.on('exit', (code) => process.exit(code ?? 0));
