/**
 * One-import consumer surface — bootstrap + theming re-exported on the
 * grid package root so apps need a single `@wellsfargo-starui/grid`
 * import specifier for the common path.
 *
 * Advanced / escape-hatch imports remain on their original subpaths:
 *   `@wellsfargo-starui/grid/core`      — MarketsGrid, storage helpers
 *   `@wellsfargo-starui/react`          — shadcn primitives
 *   `@wellsfargo-starui/design-system`  — tokens, CSS paths
 */
export {
  createStarui,
  useStaruiIdentity,
  StaruiIdentityProvider,
  DataHubProvider,
  type CreateStaruiOptions,
  type Starui,
  type StaruiIdentity,
} from '@wellsfargo-starui/react/data/runtime';

export {
  applyTheme,
  getTheme,
  type ThemeOptions,
  type Mode,
  type LightVariant,
} from '@wellsfargo-starui/design-system/apply-theme';

export type { MarketsGridHandle } from '@wellsfargo-starui/grid/core';
