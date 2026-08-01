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

export interface WriteAlertProfilesOptions {
  outDir: string;
  mkdir?: typeof mkdirSync;
  write?: typeof writeFileSync;
  log?: (message: string) => void;
}

/** Write alert demo profile JSON files under `outDir`. */
export function writeAlertProfileJsonFiles({
  outDir,
  mkdir = mkdirSync,
  write = writeFileSync,
  log = console.log,
}: WriteAlertProfilesOptions): number {
  mkdir(outDir, { recursive: true });
  let count = 0;
  for (const entry of ALERT_DEMO_PROFILES) {
    const payload = toExportedProfilePayload(entry);
    const file = join(outDir, `${entry.id}.json`);
    write(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    log(`wrote ${file}`);
    count += 1;
  }
  return count;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  writeAlertProfileJsonFiles({ outDir: join(__dirname, '../public/alert-profiles') });
}
