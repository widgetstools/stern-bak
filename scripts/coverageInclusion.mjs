/**
 * coverageInclusion.mjs — "is every source file actually being scored?"
 *
 * The per-file threshold only bites on files the coverage report CONTAINS. A
 * file that no `coverage.include` glob matches is not a 0% file — it is an
 * absent one, and the gate reads absence as silence. That is the failure mode
 * this module exists to catch: `spg-pricing-blotter` shipped six source files
 * (`App.tsx`, `main.tsx`, the provider pair, the import dialog, the bootstrap)
 * that were never in any report, because its vitest config had no `coverage`
 * block at all and v8's default only scores what a test happened to import.
 *
 * So the bar is stated twice, on purpose:
 *
 *   - `coverage.thresholds.perFile` — every REPORTED file is ≥ the threshold
 *   - `unreportedFiles()` here      — every file ON DISK is reported
 *
 * Both sides read the same include/exclude policy out of `vitestCoverage.mjs`,
 * so an exclusion is a single edit in one file and can never mean "quietly
 * drop this from the gate" in one place while the other still counts it.
 *
 * The matcher below is deliberately hand-rolled rather than `picomatch`. The
 * two install roots hoist different picomatch majors (2.3.2 here, 4.0.5 under
 * `apps/`), both only as transitives of vitest — a gate that resolves its
 * matcher by luck stops gating the day that luck changes, and declaring it
 * directly would pin a third copy in each tree. The grammar the policy globs
 * actually use is small and closed: `**`, `*`, `?`, `{a,b}` and literals.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Directories never worth walking into. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo', '.git', 'build']);

/**
 * One glob → one anchored RegExp, matching against a forward-slashed path.
 *
 * `**` spans separators (`a/**' + '/b` also matches `a/b`, hence the optional
 * leading slash), a lone `*` and `?` stop at one, and `{a,b}` alternates.
 * Everything else is a literal. Anything richer than that does not belong in a
 * coverage policy.
 */
export function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i += 1;
        if (glob[i + 1] === '/') { i += 1; out += '(?:[^/]*\\/)*'; } else { out += '.*'; }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) { out += '\\{'; continue; }
      const alts = glob.slice(i + 1, end).split(',').map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      out += `(?:${alts.join('|')})`;
      i = end;
    } else {
      out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

/** A predicate over forward-slashed relative paths for a list of globs. */
function matcher(globs) {
  const res = globs.map(globToRegExp);
  return (path) => res.some((re) => re.test(path));
}

/** Every file under `dir`, as paths relative to `dir` with forward slashes. */
function walk(dir, base = dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(abs, base, out);
    } else if (entry.isFile()) {
      out.push(relative(base, abs).split(sep).join('/'));
    }
  }
  return out;
}

/**
 * The files a coverage policy claims to score, relative to `rootDir`.
 *
 * @param {string} rootDir directory the vitest config's globs are relative to
 * @param {{include: string[], exclude: string[]}} policy
 * @returns {string[]} sorted, forward-slashed, relative to `rootDir`
 */
export function listPolicyFiles(rootDir, policy) {
  const isIncluded = matcher(policy.include);
  const isExcluded = matcher(policy.exclude);
  return walk(rootDir)
    .filter((f) => isIncluded(f) && !isExcluded(f))
    .sort();
}

/**
 * Files the policy says to score that the summary does not contain.
 *
 * Summary keys are absolute paths (v8's json-summary writes them that way);
 * they are compared as paths relative to `rootDir` so a differently-rooted
 * run still lines up.
 *
 * @param {string} rootDir
 * @param {Record<string, unknown>} summary parsed coverage-summary.json
 * @param {{include: string[], exclude: string[]}} policy
 */
export function unreportedFiles(rootDir, summary, policy) {
  const reported = new Set(
    Object.keys(summary)
      .filter((k) => k !== 'total')
      .map((k) => relative(rootDir, k).split(sep).join('/')),
  );
  return listPolicyFiles(rootDir, policy).filter((f) => !reported.has(f));
}

/** True when `dir` exists and is a directory. */
export function isDir(dir) {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
