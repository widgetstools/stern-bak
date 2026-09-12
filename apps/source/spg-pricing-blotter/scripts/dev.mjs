/**
 * One-command dev: the SQLite/STOMP pricing server + the Vite app together.
 * Spawns through a shell (Windows-safe, same policy as the repo's run-app
 * launcher) and tears both down on Ctrl-C.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const server = spawn('node', ['server/server.mjs'], { cwd: APP_DIR, stdio: 'inherit', shell: process.platform === 'win32' });
const vite = spawn('npx', ['vite'], { cwd: APP_DIR, stdio: 'inherit', shell: process.platform === 'win32' });

const stop = () => {
  server.kill();
  vite.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => { if (code && code !== 0) stop(); });
vite.on('exit', stop);
