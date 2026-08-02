import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/** Read the dev-server port from vite.config.ts without importing it (avoids esbuild in jsdom). */
export function readViteDevPort(appDir) {
    const source = readFileSync(join(appDir, 'vite.config.ts'), 'utf8');
    const match = source.match(/port:\s*(\d+)/);
    if (!match)
        throw new Error(`No port in ${join(appDir, 'vite.config.ts')}`);
    return Number(match[1]);
}
export function appOriginFromDir(metaUrl) {
    const appDir = dirname(fileURLToPath(metaUrl));
    return `http://localhost:${readViteDevPort(appDir)}`;
}
//# sourceMappingURL=vitePort.js.map