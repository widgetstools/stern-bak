// ─────────────────────────────────────────────────────────────
//  shadcn/ui adapter — re-exports compat CSS generation.
//  Canonical OKLCH tokens: tokens/starui-tokens.css
// ─────────────────────────────────────────────────────────────

import { dark, light } from '../tokens/semantic';
import type { ColorScheme } from '../tokens/semantic';

export { generateCompatCSS, generateUnifiedCSS } from './compatCss';

/** @deprecated shadcn vars are defined in starui-tokens.css */
export function generateShadcnCSS(): string {
  return '';
}

/** Get semantic scheme for JS consumers.
 *  Return type annotated explicitly — with inference, tsc emitted
 *  `import("..").ColorScheme` into the declaration file, creating a
 *  dist-only d.ts cycle (adapters/index → shadcn → package index). */
export function getShadcnTokens(mode: 'dark' | 'light'): ColorScheme {
  return mode === 'dark' ? dark : light;
}
