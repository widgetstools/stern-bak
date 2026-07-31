import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function handleValidateScaffold(opts: { projectDir: string; skipInstall?: boolean }) {
  if (!existsSync(join(opts.projectDir, 'package.json'))) {
    throw new Error(`Not a scaffold project: ${opts.projectDir}`);
  }
  const steps: string[] = [];
  if (!opts.skipInstall) {
    execSync('npm ci', { cwd: opts.projectDir, stdio: 'pipe' });
    steps.push('npm ci: ok');
  }
  execSync('npm run typecheck', { cwd: opts.projectDir, stdio: 'pipe' });
  steps.push('typecheck: ok');
  return { success: true, steps };
}
