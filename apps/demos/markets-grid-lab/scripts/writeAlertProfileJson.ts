/**
 * Writes importable gc-profile JSON files under public/alert-profiles/.
 *
 *   npx tsx apps/demos/markets-grid-lab/scripts/writeAlertProfileJson.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALERT_DEMO_PROFILES,
  toExportedProfilePayload,
} from '../src/profiles/alertDemoCatalog';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/alert-profiles');

mkdirSync(outDir, { recursive: true });

for (const entry of ALERT_DEMO_PROFILES) {
  const payload = toExportedProfilePayload(entry);
  const file = join(outDir, `${entry.id}.json`);
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log('wrote', file);
}
