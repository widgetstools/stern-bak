/** Delete the server's SQLite file so the next boot re-seeds from the seed file. */
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
rmSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'server', 'data'), { recursive: true, force: true });
console.log('[spg] server/data removed — next server start re-seeds from server/seed/spg-positions.json');
