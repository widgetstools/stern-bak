# @wellsfargo-starui/design-system — Chroma Desk

Single token tree → Tailwind preset + PrimeNG preset + CSS variables.
Used by every React and Angular app and package in the monorepo.

## Install (workspace)

Already a workspace dep of every consuming package. Nothing to install.

## Subpath imports

| Path | Use |
|---|---|
| `@wellsfargo-starui/design-system` | tokens, `componentTokens()`, `applyTheme`, `getTheme`, cell renderers |
| `@wellsfargo-starui/design-system/css` | the bundled stylesheet — import once in app's globals.css/styles.scss |
| `@wellsfargo-starui/design-system/tailwind` | `tailwindPreset` for tailwind.config.js |
| `@wellsfargo-starui/design-system/primeng` | `primengPreset` for `definePreset(Aura, …)` |
| `@wellsfargo-starui/design-system/shadcn` | `generateUnifiedCSS()` (advanced — apps don't usually need this directly) |
| `@wellsfargo-starui/design-system/adapters/ag-grid` | `agGridDarkParams` / `agGridLightParams` |
| `@wellsfargo-starui/design-system/tokens/{primitives,semantic,components}` | direct token access |
| `@wellsfargo-starui/design-system/cell-renderers` | AG Grid cell renderer components |

## How to change a color

1. Open `src/tokens/primitives.ts` (palette) or `src/tokens/semantic.ts` (role mapping).
2. Edit the value.
3. Run `npm run build --workspace=@wellsfargo-starui/design-system` to regenerate `dist/css/theme.css`.
4. Apps pick up the change on next dev reload.
5. The contrast audit (`tests/tokens/contrast-audit.test.ts`) runs as part of `npm test` — fixes must keep WCAG ratios in spec.

## How to add a theme variant (e.g. a high-contrast mode)

1. Add a new `ColorScheme` object in `src/tokens/semantic.ts`.
2. Update `src/adapters/shadcn.ts` `generateUnifiedCSS()` to emit a `[data-theme="high-contrast"]` block for the new scheme.
3. Update `src/applyTheme.ts` `Mode` type to include the new value.
4. Done. PrimeNG, shadcn, Tailwind, AG Grid all repaint automatically because they read `--ds-*` vars.

## How to test a token change locally

```bash
npm test --workspace=@wellsfargo-starui/design-system
```

Snapshots in `tests/adapters/__snapshots__/` will fail if the change ripples through. Review the diff carefully and update with `npm test --workspace=@wellsfargo-starui/design-system -- -u` only after verifying the visual change is intentional.

## What is NOT in this package

- No app-specific component variants — those live in their consuming package
- No layout components (cards, modals, etc.) — those live in `@wellsfargo-starui/ui`
- No business logic — pure design tokens + adapter glue
- No font assets — apps load Geist + JetBrains Mono via Google Fonts or local @font-face

## Related docs

- `docs/ARCHITECTURE_GUIDE.md` — platform orientation
- `tests/tokens/contrast-audit.test.ts` — WCAG gate
