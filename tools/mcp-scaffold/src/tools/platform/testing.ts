import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { handleValidateScaffold } from '../validateScaffold.js';
import { handleTestStompConnection } from './provider.js';
import { handleDiagnoseDataPlane } from './workflow.js';

export async function handleSmokeTestApp(opts: { projectDir: string; skipInstall?: boolean }) {
  const steps: string[] = [];
  try {
    const scaffold = handleValidateScaffold({ projectDir: opts.projectDir, skipInstall: opts.skipInstall });
    steps.push(...scaffold.steps);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err), steps };
  }

  const pkg = JSON.parse(readFileSync(join(opts.projectDir, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
  if (pkg.scripts?.['dev:stomp']) {
    steps.push('has dev:stomp script');
  }

  return { success: true, steps };
}

export async function handleValidateStompE2e(opts: { projectDir: string; stompPort?: number }) {
  const connection = await handleTestStompConnection({ port: opts.stompPort });
  const diagnose = await handleDiagnoseDataPlane({ projectDir: opts.projectDir, stompPort: opts.stompPort });

  return {
    connection,
    diagnose,
    pass: connection.health.ok && diagnose.issues.filter((i) => i.severity === 'error').length === 0,
    manualSteps: [
      'npm run dev:stomp',
      'npm run dev',
      'Select STOMP provider in grid toolbar',
      'Expect rows after snapshot Success token',
    ],
  };
}

export function handleSnapshotGridConfig(opts: { projectDir: string; gridId: string }) {
  const hints: string[] = [];
  const localStorageKey = `markets-grid-local-storage-bundle:${opts.gridId}`;
  hints.push(`localStorage key (basic template): ${localStorageKey}`);
  hints.push(`ConfigManager key (hosted): markets-grid-profile-set / instanceId=${opts.gridId}`);
  hints.push('Export: grid toolbar Save or Config Browser');

  const inspector = join(opts.projectDir, 'src/components/ConfigInspector.tsx');
  if (existsSync(inspector)) hints.push('ConfigInspector component available in project');

  return { gridId: opts.gridId, exportHints: hints };
}
