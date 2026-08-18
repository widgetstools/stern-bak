#!/usr/bin/env node
/**
 * Complexity ceilings, enforced on the DIFF rather than on the repo.
 *
 * CLAUDE.md calls 800 lines / file and 80 lines / function binding. ESLint has
 * both as `warn`, and ~190 functions and 7 files are already over — so the
 * ceilings are not enforced, they are a norm applied to code people touch. The
 * norm that has actually been applied is narrower and more useful:
 *
 *     don't make it worse, and fix what you grew.
 *
 * This makes that mechanical. For every file changed against the base ref, it
 * compares the file's complexity budget before and after and fails when the
 * budget grew. Legacy violations are left alone; a file that was already over
 * may stay over, but it may not get worse.
 *
 * ## Why "excess", not "violation count"
 *
 * The budget is the TOTAL LINES OVER THE CEILING in a file, per rule. That one
 * number gets every case right:
 *
 *   - a new violation appears           0 → 10   worse, fail
 *   - an existing one grows          102 → 105   worse, fail   (this is the
 *                                                 regression Phase 11 shipped
 *                                                 and its lint check missed)
 *   - one big function is SPLIT      [200] → [120, 100]
 *                                    excess 120 → 60           better, pass
 *
 * Counting violations instead would punish the split, which is the exact
 * change the ceiling exists to encourage.
 *
 * ## Why ESLint's numbers and not `wc -l`
 *
 * Because ESLint's is the only definition anything enforces, and the two
 * disagree a lot: `max-lines` is configured `skipBlankLines: true,
 * skipComments: true`, so a heavily-commented 895-line file can sit
 * comfortably under 800 by the rule. Four phase records in
 * `docs/SSRM_PARITY_COMPLETION.md` reported files as "over the ceiling" from
 * `wc -l` that the rule never flagged. Reading the numbers off the rule is how
 * that stops happening.
 *
 * Usage:
 *   node scripts/check-complexity-budget.mjs [--base=<ref>] [--verbose]
 *
 * Exit 0 when no changed file's budget grew, 1 otherwise.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';

/**
 * `fails: true` blocks; `fails: false` reports and does not.
 *
 * The two ceilings are not equally actionable, and pretending they are is how
 * a check gets switched off. A function over the ceiling can ALWAYS be brought
 * back locally — hoist a closure that captures nothing to module level, which
 * is a mechanical edit taking a couple of minutes and leaving the code better.
 * A file over the ceiling can only be fixed by SPLITTING it, which is a design
 * decision about what belongs where; forcing that on whoever happens to add
 * the next feature line means either a rushed split or a disabled check.
 *
 * So growth in a function is a failure, growth in a file is reported and
 * scheduled. Every regression this was written after — four of them, across
 * Phases 11 and 14 — was function-level.
 */
const RULES = {
  'max-lines': { ceiling: 800, fails: false },
  'max-lines-per-function': { ceiling: 80, fails: true },
};

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const baseArg = args.find((a) => a.startsWith('--base='))?.slice('--base='.length);

function git(...a) {
  // stderr piped, not inherited: `git show <base>:<path>` for a file added in
  // this branch is an expected miss, and letting it print `fatal: ...` would
  // make a clean run look like a broken one.
  return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tryGit(...a) {
  try {
    return git(...a);
  } catch {
    return null;
  }
}

/**
 * The ref to compare against.
 *
 * Explicit `--base` wins — that is what CI passes, where the base is the PR's
 * target and the diff is the PR. Locally the default is the branch's UPSTREAM,
 * so a bare run means "the work I am about to push". `origin/main` is the last
 * resort and is deliberately not the first: on a long-lived branch it makes the
 * diff the entire branch, and every file ever rewritten reads as growth.
 */
function resolveBase() {
  const candidates = baseArg ? [baseArg] : ['@{upstream}', 'origin/main', 'main'];
  for (const ref of candidates) {
    if (tryGit('rev-parse', '--verify', '--quiet', `${ref}^{commit}`)) return ref;
  }
  console.error(
    `check-complexity-budget: no base ref found (tried ${candidates.join(', ')}).\n` +
      '  Pass one explicitly: --base=<ref>',
  );
  process.exit(1);
}

/** Files changed against the base, restricted to the linted source tree. */
function changedFiles(base) {
  const mergeBase = tryGit('merge-base', base, 'HEAD') ?? base;
  const out = git('diff', '--name-only', '--diff-filter=ACMR', mergeBase, 'HEAD', '--', 'packages');
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /\.tsx?$/.test(l));
}

/** `... has too many lines (208). Maximum allowed is 80` → 208 */
function reportedLines(message) {
  const m = /\((\d+)\)/.exec(message);
  return m ? Number(m[1]) : null;
}

/**
 * Lines over the ceiling in this source, summed per rule. `null` source (the
 * file did not exist at the base) is an empty budget, so every violation in a
 * new file is growth.
 */
async function budgetOf(eslint, filePath, source) {
  const budget = Object.fromEntries(Object.keys(RULES).map((r) => [r, 0]));
  if (source === null) return budget;
  const [result] = await eslint.lintText(source, { filePath, warnIgnored: false });
  for (const msg of result?.messages ?? []) {
    const rule = RULES[msg.ruleId];
    if (rule === undefined) continue;
    const lines = reportedLines(msg.message);
    if (lines !== null && lines > rule.ceiling) budget[msg.ruleId] += lines - rule.ceiling;
  }
  return budget;
}

async function main() {
  const base = resolveBase();
  const files = changedFiles(base);
  if (files.length === 0) {
    console.log(`check-complexity-budget: no changed source files vs ${base} — nothing to check`);
    return;
  }

  const eslint = new ESLint();
  const mergeBase = tryGit('merge-base', base, 'HEAD') ?? base;
  const failures = [];

  for (const file of files) {
    // "After" is the WORKING TREE, not HEAD: locally that is the code you are
    // about to commit, and in CI the two are the same. Reading HEAD instead
    // would tell you about a regression only once it was too late to fix it
    // without a second commit.
    let current;
    try {
      current = readFileSync(file, 'utf8');
    } catch {
      continue; // deleted since the diff was taken
    }
    const after = await budgetOf(eslint, file, current);
    const before = await budgetOf(eslint, file, tryGit('show', `${mergeBase}:${file}`));

    for (const rule of Object.keys(RULES)) {
      if (after[rule] > before[rule]) {
        failures.push({ file, rule, before: before[rule], after: after[rule] });
      }
    }
    if (verbose) {
      const parts = Object.keys(RULES)
        .map((r) => `${r}: ${before[r]} \u2192 ${after[r]}`)
        .join(', ');
      console.log(`  ${file}  (${parts})`);
    }
  }

  console.log(
    `check-complexity-budget: ${files.length} changed source file(s) vs ${base}`,
  );

  const blocking = failures.filter((f) => RULES[f.rule].fails);
  const reported = failures.filter((f) => !RULES[f.rule].fails);

  const describe = (f) =>
    `  ${f.file}\n` +
    `    ${f.rule} (max ${RULES[f.rule].ceiling}): ${f.before} \u2192 ${f.after} lines over\n`;

  if (reported.length > 0) {
    console.log('\nNOTE  a changed FILE grew further over the 800-line ceiling.');
    console.log('      Not blocking — splitting a file is a design decision, not');
    console.log('      something to force on whoever adds the next feature line.');
    console.log('      Worth scheduling:\n');
    for (const f of reported) console.log(describe(f));
  }

  if (blocking.length === 0) {
    console.log('OK  no changed file grew a function further over the 80-line ceiling');
    return;
  }

  console.error('\nFAIL  a changed file grew a function further over the 80-line ceiling.\n');
  for (const f of blocking) console.error(describe(f));
  console.error(
    'Legacy violations are fine to leave. This fails only when a function you\n' +
      'touched got WORSE. The fix is always available: hoist a closure that\n' +
      'captures nothing to module level, which pays for what you added and\n' +
      'leaves the function smaller than you found it.\n' +
      'Run with --verbose to see every changed file\'s budget.',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('check-complexity-budget: failed to run\n', err);
  process.exit(1);
});
