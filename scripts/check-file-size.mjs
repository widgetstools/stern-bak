#!/usr/bin/env node
/**
 * check-file-size.mjs — the complexity ceilings (CLAUDE.md: ≤ 800 lines per
 * file, ≤ 80 per function), enforced as a ratchet.
 *
 * ESLint already measures both — `max-lines` and `max-lines-per-function` in
 * eslint.config.mjs, logical lines with blank lines and comments skipped —
 * but only as warnings, because the backlog predates the rule. This script
 * runs those two rules alone (same options, same carve-outs, read from the
 * config itself so the gate can never disagree with `npm run lint`) and
 * compares the result with scripts/file-size-baseline.json:
 *
 *   - a file NOT in the baseline may not exceed either ceiling;
 *   - a file IN the baseline may not grow: its logical line count and its
 *     number of over-ceiling functions may only stay or fall;
 *   - a baseline entry a file no longer needs is reported as stale so the
 *     baseline is lowered (`--update`); the ratchet turns one way.
 *
 * Every entry names the refactor-plan phase that removes it, or null when
 * none is scheduled (docs/superpowers/plans/2026-09-13-grid-apply-and-mount-refactor-plan.md §0.4).
 *
 * Usage:
 *   node scripts/check-file-size.mjs                     # gate: exit 1 on growth
 *   node scripts/check-file-size.mjs --report            # never exits non-zero
 *   node scripts/check-file-size.mjs --update            # lower the baseline to the current state; refuses growth
 *   node scripts/check-file-size.mjs --update --allow-growth   # seed, or accept growth deliberately (say why in the commit)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { ESLint } from 'eslint';
import repoConfig from '../eslint.config.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const BASELINE_PATH = resolve(REPO_ROOT, 'scripts/file-size-baseline.json');
const argv = process.argv.slice(2);
const reportOnly = argv.includes('--report');
const update = argv.includes('--update');
const allowGrowth = argv.includes('--allow-growth');

// ── the rules, straight from eslint.config.mjs ──────────────────────────────
const base = repoConfig.find((b) => Array.isArray(b.rules?.['max-lines']));
if (!base) throw new Error('eslint.config.mjs has no block with a max-lines rule array');
const fileMax = base.rules['max-lines'][1].max;
const fnMax = base.rules['max-lines-per-function'][1].max;
const exempt = repoConfig.filter((b) => b.rules?.['max-lines'] === 'off');
const ignores = repoConfig.filter((b) => b.ignores && !b.files);

const eslint = new ESLint({
  cwd: REPO_ROOT,
  overrideConfigFile: true,
  overrideConfig: [
    ...ignores,
    {
      files: base.files,
      languageOptions: base.languageOptions,
      // Only two rules run here, so every `eslint-disable` for another rule
      // would otherwise be reported as unused.
      linterOptions: { reportUnusedDisableDirectives: 'off' },
      rules: {
        'max-lines': ['error', base.rules['max-lines'][1]],
        'max-lines-per-function': ['error', base.rules['max-lines-per-function'][1]],
      },
    },
    ...exempt.map((b) => ({ files: b.files, rules: { 'max-lines': 'off', 'max-lines-per-function': 'off' } })),
  ],
});

const current = new Map(); // rel path → { lines: number | null, longFunctions: number }
for (const r of await eslint.lintFiles(['packages/**/*.{ts,tsx}'])) {
  if (r.messages.length === 0) continue;
  const rel = relative(REPO_ROOT, r.filePath);
  const entry = { lines: null, longFunctions: 0 };
  for (const m of r.messages) {
    if (m.fatal) throw new Error(`${rel}: ${m.message}`);
    if (m.ruleId === 'max-lines') entry.lines = Number(/\((\d+)\)/.exec(m.message)?.[1] ?? -1);
    else if (m.ruleId === 'max-lines-per-function') entry.longFunctions += 1;
  }
  if (entry.lines != null || entry.longFunctions > 0) current.set(rel, entry);
}

// ── baseline ────────────────────────────────────────────────────────────────
const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  : { files: {} };
const known = baseline.files ?? {};
const describe = (e) => [e.lines != null ? `${e.lines} logical lines` : null, e.longFunctions ? `${e.longFunctions} function(s) over ${fnMax} lines` : null].filter(Boolean).join(', ');

const grew = [];
const stale = [];
for (const [rel, cur] of [...current.entries()].sort()) {
  const b = known[rel];
  if (!b) { grew.push(`${rel}: new over-ceiling file — ${describe(cur)}`); continue; }
  if (cur.lines != null && (b.lines == null || cur.lines > b.lines)) grew.push(`${rel}: ${cur.lines} logical lines (baseline ${b.lines ?? `≤ ${fileMax}`})`);
  if (cur.longFunctions > (b.longFunctions ?? 0)) grew.push(`${rel}: ${cur.longFunctions} function(s) over ${fnMax} lines (baseline ${b.longFunctions ?? 0})`);
}
for (const rel of Object.keys(known).sort()) {
  const b = known[rel];
  const cur = current.get(rel);
  if (!cur) { stale.push(`${rel}: no longer over any ceiling`); continue; }
  const linesDown = b.lines != null && (cur.lines == null || cur.lines < b.lines);
  const fnsDown = cur.longFunctions < (b.longFunctions ?? 0);
  if (linesDown || fnsDown) stale.push(`${rel}: shrank to ${describe(cur)}`);
}

const w = (s) => process.stdout.write(s);

if (update) {
  if (grew.length > 0 && !allowGrowth) {
    w(`\n✗ --update refused: ${grew.length} file(s) grew past the ceilings or the baseline. Pass --allow-growth only for a deliberate exception:\n`);
    for (const g of grew) w(`    ${g}\n`);
    process.exit(1);
  }
  const files = {};
  for (const rel of [...current.keys()].sort()) {
    const cur = current.get(rel);
    files[rel] = { lines: cur.lines, longFunctions: cur.longFunctions, phase: known[rel]?.phase ?? null };
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify({
    $comment: `Ratchet baseline for scripts/check-file-size.mjs (npm run check:loc). Logical lines per ESLint max-lines (blank + comment lines skipped); ceilings ${fileMax} lines / ${fnMax} per function. Entries only go down; "phase" names the refactor-plan phase that removes the entry, null = none scheduled.`,
    files,
  }, null, 2)}\n`);
  w(`\nbaseline written: ${Object.keys(files).length} file(s) carried (${stale.length} lowered/removed, ${allowGrowth ? grew.length : 0} accepted as growth)\n`);
  process.exit(0);
}

if (grew.length > 0) {
  w(`\n✗ ${grew.length} file(s) grew past the size ceilings (${fileMax} logical lines per file, ${fnMax} per function) or past their baseline:\n`);
  for (const g of grew) w(`    ${g}\n`);
  w('\n  Split the file or the function (CLAUDE.md "Complexity ceilings"). A deliberate exception is\n');
  w('  `node scripts/check-file-size.mjs --update --allow-growth`, explained in the commit.\n');
}
if (stale.length > 0) {
  w(`\n  ${stale.length} baseline entry(ies) can be lowered — run \`node scripts/check-file-size.mjs --update\`:\n`);
  for (const s of stale) w(`    ${s}\n`);
}
if (grew.length === 0) w(`\nPASS — no file grew past ${fileMax} lines / ${fnMax} lines per function (${Object.keys(known).length} file(s) carried in the baseline)\n`);
if (grew.length > 0 && !reportOnly) process.exit(1);
