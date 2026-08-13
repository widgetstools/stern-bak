/**
 * CI / pre-ship check: public/seed.json must be a valid deploy seed bundle.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = join(root, 'public', 'seed.json');

function fail(message) {
  console.error(`[validate-seed] ${message}`);
  process.exit(1);
}

let raw;
try {
  raw = JSON.parse(readFileSync(seedPath, 'utf8'));
} catch (err) {
  fail(`Could not read or parse ${seedPath}: ${err instanceof Error ? err.message : err}`);
}

if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
  fail('seed.json must be a JSON object');
}
if (raw.kind === 'starui.dataProvider') {
  fail('seed.json is a data-provider export — use Config Browser rocket (deploy) export instead');
}
if (!Array.isArray(raw.appRegistry) || raw.appRegistry.length === 0) {
  fail('seed.json must include a non-empty appRegistry[]');
}
if (typeof raw.activeAppId !== 'string' || !raw.activeAppId.trim()) {
  fail('seed.json must include activeAppId (deployment scope)');
}
if (typeof raw.activeUserId !== 'string' || !raw.activeUserId.trim()) {
  fail('seed.json must include activeUserId (signed-in user scope)');
}

const appConfigCount = Array.isArray(raw.appConfig) ? raw.appConfig.length : 0;
console.log(
  `[validate-seed] OK — activeAppId=${raw.activeAppId} activeUserId=${raw.activeUserId} ` +
  `appRegistry=${raw.appRegistry.length} appConfig=${appConfigCount}`,
);
