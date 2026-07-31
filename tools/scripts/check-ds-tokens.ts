#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────
//  check-ds-tokens — fails CI when forbidden patterns appear.
//  - hardcoded #rgb / #rrggbb literals (outside the design-system pkg)
//  - legacy --bn-/--fi-/--mdl-/--ck-/--gc- CSS var references
//  - inline style={{ color|background|border-color: '…' }} usage
// ─────────────────────────────────────────────────────────────

import { readFileSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';

export type Rule =
  | 'no-hardcoded-hex'
  | 'no-legacy-css-var'
  | 'no-inline-style';

export interface Issue {
  file: string;
  line: number;
  rule: Rule;
  excerpt: string;
}

const HEX_RE        = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const LEGACY_VAR_RE = /--(?:bn|fi|mdl|ck|gc)-[a-zA-Z0-9-]+/g;
// Only flag inline styles that contain a hardcoded hex OR a legacy CSS var —
// inline styles that reference --ds-* tokens or shadcn vars are fine.
const INLINE_RE     = /style\s*=\s*\{\{[^}]*(?:color|background|border)[^}]*(?:#[0-9a-fA-F]{3,8}|--(?:bn|fi|mdl|ck|gc)-)/g;

const STYLE_EXTS = new Set(['.css', '.scss', '.sass', '.less']);
const CODE_EXTS  = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']);

export function lintFile(path: string): Issue[] {
  const ext = extname(path);
  if (!STYLE_EXTS.has(ext) && !CODE_EXTS.has(ext)) return [];
  const src = readFileSync(path, 'utf8');
  const issues: Issue[] = [];
  src.split('\n').forEach((line, i) => {
    const ln = i + 1;
    const m1 = line.match(HEX_RE);
    if (m1) issues.push({ file: path, line: ln, rule: 'no-hardcoded-hex', excerpt: m1.join(', ') });
    const m2 = line.match(LEGACY_VAR_RE);
    if (m2) issues.push({ file: path, line: ln, rule: 'no-legacy-css-var', excerpt: m2.join(', ') });
    const m3 = line.match(INLINE_RE);
    if (m3) issues.push({ file: path, line: ln, rule: 'no-inline-style', excerpt: m3.join(', ') });
  });
  return issues;
}

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.turbo', '.git', '.next', 'coverage',
  '__snapshots__', '__fixtures__', 'libs',
  // External reference materials (user-provided design system samples,
  // unpacked zips, etc.) — not project code, kept in-tree as a reference
  // for migration work. Match by exact directory name.
  'Markets Design System-latest',
]);

// design-system package itself is allowed to define hex; everywhere
// else must reference --ds-* vars.
const ALLOW_PATHS = [
  'packages/design-system/design-system/src/',
  'patch/',  // working dir, deleted at end of migration
  // --- Legitimate hex data (not styling) ---
  'packages/design-system/icons-svg/',
  'packages/openfin/openfin-platform/src/',
  'packages/design-system/design-system/tests/',
  'packages/react-core/widgets-react/src/container/markets-grid-container/MarketsGridContainer.tsx',
  'packages/react-grid/grid/src/customizer/ui/ExpressionEditor/language.ts',
  'packages/react-ui/ui/src/components/chart.tsx',
  'packages/react-grid/grid/src/customizer/ui/format-editor/FormatColorPicker.tsx',
  'packages/react-grid/grid/src/customizer/ui/format-editor/types.ts',
  'packages/react-grid/grid/src/customizer/ui/ColorPicker/CompactColorField.tsx',
  'packages/react-grid/grid/src/customizer/ui/shadcn/color-picker.tsx',
  'packages/react-grid/grid/src/customizer/ui/StyleEditor/BorderStyleEditor.tsx',
  'packages/react-grid/grid/src/customizer/modules/conditional-styling/styleBridge.ts',
  'packages/react-grid/grid/src/customizer/modules/conditional-styling/ConditionalStylingPanel.tsx',
  // --- Tool scripts themselves ---
  'tools/',
  // --- Test files: hex in assertion fixtures ---
  'e2e/',
  'packages/react-grid/grid/src/widget/FormattingToolbar.test.tsx',
  'packages/react-grid/grid/src/customizer/modules/column-customization/formattingActions.test.ts',
  'packages/react-grid/grid/src/customizer/modules/column-templates/snapshotTemplate.test.ts',
  'packages/react-core/widgets-react/src/hosted/__tests__/useColorLinking.test.tsx',
  'packages/react-core/widgets-react/src/hosted/useColorLinking.ts',
  // --- Demo app profile/fixture data files ---
  'apps/demos/demo-react/src/showcaseProfile.ts',
  'apps/demos/demo-react/src/nestedFixtures.ts',
  'apps/demos/demo-configservice-react/src/showcaseProfile.ts',
  'apps/demos/demo-angular/src/app/services/trading-data.service.ts',
  'apps/demos/demo-angular/src/app/widgets/design-system.widget.ts',
  'apps/demos/demo-angular/src/app/app.ts',
];

function walk(dir: string, root: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = resolve(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, root, out);
    else out.push(p);
  }
}

function isAllowed(rel: string): boolean {
  return ALLOW_PATHS.some(p => rel.startsWith(p));
}

export function lintRepo(root: string): Issue[] {
  const files: string[] = [];
  walk(root, root, files);
  const issues: Issue[] = [];
  for (const f of files) {
    if (isAllowed(relative(root, f))) continue;
    issues.push(...lintFile(f));
  }
  return issues;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const issues = lintRepo(process.cwd());
  for (const i of issues) {
    console.error(`${relative(process.cwd(), i.file)}:${i.line}  [${i.rule}]  ${i.excerpt}`);
  }
  if (issues.length > 0) {
    console.error(`\n${issues.length} issue(s) — design-system token policy violations.`);
    process.exit(1);
  }
  console.log('check-ds-tokens: clean.');
}
