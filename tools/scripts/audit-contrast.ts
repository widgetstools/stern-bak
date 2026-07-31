#!/usr/bin/env tsx
import { dark, light } from '../../packages/design-system/design-system/src/tokens/semantic';
import { contrastRatio } from '../../packages/design-system/design-system/src/internal/wcag';

interface Row { theme: string; pair: string; ratio: number; min: number; pass: boolean; }

const checks = (n: string, s: typeof dark): Row[] => [
  ['text.primary on ground',   s.text.primary,   s.surface.ground, 7],
  ['text.secondary on ground', s.text.secondary, s.surface.ground, 4.5],
  ['text.muted on ground',     s.text.muted,     s.surface.ground, 4],
  ['accent.info on ground',    s.accent.info,    s.surface.ground, 4.5],
  ['accent.positive on ground',s.accent.positive,s.surface.ground, 4.5],
  ['accent.negative on ground',s.accent.negative,s.surface.ground, 4.5],
  ['accent.warning on ground', s.accent.warning, s.surface.ground, 4.5],
].map(([pair, fg, bg, min]) => ({
  theme: n,
  pair: pair as string,
  ratio: contrastRatio(fg as string, bg as string),
  min: min as number,
  pass: contrastRatio(fg as string, bg as string) >= (min as number),
}));

const rows = [...checks('dark', dark), ...checks('light', light)];
let failed = 0;
for (const r of rows) {
  const mark = r.pass ? '✓' : '✗';
  if (!r.pass) failed++;
  console.log(`  ${mark} ${r.theme.padEnd(6)} ${r.pair.padEnd(36)} ${r.ratio.toFixed(2).padStart(6)} : ${r.min}`);
}
if (failed > 0) {
  console.error(`\n${failed} contrast check(s) failed`);
  process.exit(1);
}
console.log('\nAll contrast checks pass.');
