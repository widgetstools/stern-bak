# Design system upgrade & OpenFin palette integration

How the monorepo was migrated to the **StarUI v1 OKLCH design system** (cyan-blue accent / teal / rose, FT paper light + blue-graphite dark), and how **OpenFin Workspace chrome** (dock, browser tabs, modals) was wired to the same tokens. The accent family (`--primary` / `--ring` / `--accent` / `--accent-foreground`, light + dark) is kept aligned to the canonical `starui-design-system` source — one vivid accent, no separate `--highlight` token.

Use this guide when:

- Pulling a new `starui-design-system` drop into `packages/design-system/`
- Debugging “content theme flips but dock/chrome stays dark”
- Fixing Tailwind / shadcn / AG Grid colors after a token change
- Re-validating OpenFin `CustomPaletteSet` contrast (page tabs, dock dropdowns)

**Related docs:** [`current-features.md`](../current-features.md) § `@wellsfargo-starui/design-system` and § `@wellsfargo-starui/openfin-platform`.

---

## 1. Two theming layers (do not confuse them)

| Layer | What it styles | Mechanism | Package / file |
|-------|----------------|-----------|----------------|
| **App content** | React widgets, shadcn, AG Grid rows, provider window | CSS `data-theme` on `<html>` + `@wellsfargo-starui/design-system/css` | `applyTheme()`, `starui-tokens.css` |
| **OpenFin workspace chrome** | Dock bar, browser page tabs, home/store, platform modals | `WorkspacePlatform.init({ theme: [{ palettes: { dark, light } }] })` | `openfinPalette.ts`, `workspace.ts` |

Both must flip together on the dock theme toggle:

1. `platform.Theme.setSelectedScheme(light|dark)` — OpenFin chrome
2. `document.documentElement.setAttribute('data-theme', …)` — StarUI CSS
3. `fin.InterApplicationBus.publish('theme-changed', …)` — child views / grids

Content can look correct while chrome stays wrong if **only** step 2 runs (wrong or identical OpenFin palettes registered at init).

---

## 2. Design system source of truth

### 2.1 Canonical token file

**Path:** `packages/design-system/design-system/src/tokens/starui-tokens.css`

- Colours are **bare OKLCH components** (`L C H`), not wrapped in `oklch()`, so consumers can add alpha: `oklch(var(--primary) / 0.12)`.
- **Light** tokens: `:root` and `[data-theme="light"]` (FT paper hue ~67).
- **Dark** tokens: `.dark` and `[data-theme="dark"]` (blue-graphite hue ~258).
- Semantic trading colours: `--positive` / `--negative` (teal / rose), `--buy` / `--sell`, `--warning`, `--info`.

When upgrading from an external design-system repo, **replace this file** (and `tokens.json` if present) first, then rebuild.

### 2.2 Built CSS bundle

`npm run build` in `@wellsfargo-starui/design-system` runs:

1. `tsc` → `dist/`
2. `scripts/build-css.ts` → **`dist/css/theme.css`**

The bundle concatenates:

| Piece | Source |
|-------|--------|
| Tokens | `starui-tokens.css` |
| Legacy bridges | `generateCompatCSS()` in `src/adapters/compatCss.ts` (`--ds-*`, `--bn-*`, `--p-*`) |
| Base utilities | `src/styles/base.css` |
| AG Grid overrides | `src/styles/ag-grid.css` |
| Scrollbar | `src/styles/scrollbar.css` |

Apps import:

```css
@import '@wellsfargo-starui/design-system/css';
```

### 2.3 Compatibility layer (`compatCss.ts`)

Maps legacy variable names onto OKLCH tokens so existing code and shadcn aliases keep working:

- `--ds-surface-ground` → `oklch(var(--background))`
- `--bn-*` trading aliases
- `--p-*` PrimeNG aliases
- Surface scale `--surface-50` … `--surface-950`

After a token upgrade, run design-system tests (`npm test -w @wellsfargo-starui/design-system`) — snapshot tests cover compat output.

### 2.4 Framework adapters

| Adapter | Import | Role |
|---------|--------|------|
| Tailwind v3 preset | `@wellsfargo-starui/design-system/tailwind` | `oklch(var(--token) / <alpha-value>)` colours, `h-control`, font sizes from `--text-*` |
| AG Grid v33+ | `@wellsfargo-starui/design-system/adapters/ag-grid` | Single `staruiGridTheme` with light/dark `withParams`; reads `data-ag-theme-mode` |
| shadcn bridge | *(the `./shadcn` subpath was cut in the barrel diet — components consume tokens via the Tailwind preset)* | Unified CSS generation |

**Tailwind in apps:** PostCSS loads `tailwind.config.js` outside Vite, so apps use:

```js
const { tailwindPreset } = require('../../../scripts/staruiTailwindPreset.cjs');
```

That loader resolves the preset from installed `@wellsfargo-starui/design-system` or from `packages/design-system/design-system/dist/adapters/tailwind.js` after `npm run build:packages`.

### 2.5 Runtime theme API

**Path:** `packages/design-system/design-system/src/applyTheme.ts`

```ts
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';

// Boot (before React render):
applyTheme(getTheme());

// Sets on <html>:
//   data-theme="dark" | "light"
//   data-ag-theme-mode="dark" | "light"  (AG Grid v33+)
//   data-variant="clinical" | "paper"   (light only, optional)
// Persists: localStorage starui:theme (canonical key, shared with RuntimePort)
```

OpenFin child windows listen for IAB `theme-changed` and call the same attribute updates (`OpenFinRuntime.ts`).

---

## 3. Upgrade procedure (design system)

### 3.1 Copy & build

```bash
# 1. Replace token source (from external starui-design-system or design review)
packages/design-system/design-system/src/tokens/starui-tokens.css
packages/design-system/design-system/src/tokens/tokens.json   # if changed

# 2. Rebuild libraries
npm run build:packages

# 3. If apps use tarballs
npm run propagate -- design-system --no-build
npm run install:apps
```

`build:packages` runs `scripts/ensure-workspace-links.mjs` first so `@wellsfargo-starui/design-system` stays linked in root `node_modules` (see § 6).

### 3.2 Align `@wellsfargo-starui/ui` (shadcn primitives)

Primitives in `packages/react-ui/ui/src/components/` must:

- Use Tailwind semantic colours (`bg-background`, `text-foreground`, `border-border`, `h-control`, `shadow-card`)
- Not hardcode hex / gray Tailwind (`bg-gray-900`, `h-8` for controls)
- Resolve opacity via the preset’s `<alpha-value>` pattern on OKLCH vars

After token changes, spot-check dark + light in `star-demo`.

### 3.3 Align AG Grid

**Path:** `packages/design-system/design-system/src/adapters/agGrid.ts`

- One theme object (`staruiGridTheme`) with separate `withParams` for light and dark.
- Dark header/chrome uses `--muted` / `--secondary-foreground`, not legacy gray hex.
- Apps set `data-ag-theme-mode` alongside `data-theme` (handled by `applyTheme` and runtime).

Grid package imports `@wellsfargo-starui/design-system/adapters/ag-grid` — ensure `npm install` at root after package.json dependency changes.

### 3.4 Align grid customizer / formatter chrome

Search for imports of `@wellsfargo-starui/design-system/tokens` in `packages/react-grid/grid/` — colour swatches and pickers read semantic token exports.

### 3.5 Verification checklist

| Check | Command / action |
|-------|------------------|
| Design-system unit tests | `npm test -w @wellsfargo-starui/design-system` |
| Full package build | `npm run build:packages` (28 tasks) |
| star-demo Vite build | `npm run build -w @wellsfargo-starui/star-demo` |
| Dark + light toggle | Dock sun/moon → content + chrome + grid headers |
| AG Grid headers in dark | No gray “default ag-grid” header band |
| shadcn controls in dark | Inputs, selects, popovers use token backgrounds |

---

## 4. OpenFin palette integration

OpenFin Workspace does **not** read CSS variables. It requires a **`CustomPaletteSet`** per scheme at platform init ([OpenFin docs](https://developer.openfin.co/workspace/docs/platform/latest/interfaces/CustomPaletteSet.html)) — hex / rgb / hsl only.

### 4.1 Implementation location

| File | Role |
|------|------|
| `packages/openfin/openfin-platform/src/openfinPalette.ts` | Build `dark` / `light` palettes from CSS tokens |
| `packages/openfin/openfin-platform/src/workspace.ts` | `initializePlatform()` passes palettes to `WorkspacePlatform.init()` |
| `packages/openfin/openfin-platform/src/dock.ts` | Inline theme toggle → `setSelectedScheme` + IAB |
| `packages/openfin/openfin-platform/src/dockEditor/iconUtils.ts` | Dock icon colours from resolved palette text tokens |

### 4.2 How palettes are built

`buildOpenFinPalettesFromDesignSystem()`:

1. Requires `@wellsfargo-starui/design-system/css` already loaded in the provider window (star-demo: `main.tsx` imports `index.css` before `initWorkspace`).
2. Temporarily sets `<html data-theme="dark">` and samples tokens into a hidden probe element.
3. Sets `<html data-theme="light">` and samples again.
4. Restores previous `data-theme` / `data-ag-theme-mode`.
5. Converts each OKLCH component to `#RRGGBB` (browser colour parser + OKLCH→RGB fallback for tests).

**Important:** Light tokens must be defined on `:root` / `[data-theme="light"]` in `starui-tokens.css`. A child `div[data-theme="light"]` under `html[data-theme="dark"]` **inherits dark vars** unless the light selector matches that element — do not sample light palette under dark `html` without flipping the root attribute.

### 4.3 Token → OpenFin field mapping

| OpenFin `CustomPaletteSet` | Design-system CSS var | Notes |
|----------------------------|----------------------|--------|
| `brandPrimary` | `--primary` | Active tab, primary buttons |
| `brandPrimaryText` / `brandPrimaryFocused` | `--primary-foreground` + contrast pass | Page tab labels |
| `brandPrimaryHover` / `Active` | `color-mix` on primary + foreground | |
| `backgroundPrimary` | `--card` | Browser chrome background |
| `background1` … `background6` | `--background`, `--card`, `--secondary`, `--muted`, `--accent`, `--border-strong` | Surface ramp |
| `contentBackground1` … `5` | Same ramp as backgrounds | Dock dropdown (`contentBackground4` = muted) |
| `textDefault` / `textHelp` / `textInactive` | `--foreground`, `--muted-foreground` | |
| `inputBackground` / `inputColor` / `inputBorder` | `--muted`, `--foreground`, `--border` | Input-field hairline borders |
| `statusSuccess` / `Warning` / `Critical` | `--positive`, `--warning`, `--negative` | |
| `statusActive` | `--primary` (light scheme adjusted) | |
| `borderNeutral` | `--border-strong` (light) / fixed `#C0C1C2` (dark) | Chrome dividers/outlines — stronger than the `--border` input hairline. In dark mode `finalizeDarkChromePalette` forces a light grey so a dark window frame stays distinguishable from a dark desktop |

Optional `initWorkspace({ theme: { brandPrimary, brandSecondary, backgroundPrimary } })` overrides apply to the **dark** palette only; light scheme keeps its own ramp (reusing dark override knobs breaks light dock dropdowns).

### 4.4 Light-mode chrome adjustments (`finalizeLightChromePalette`)

OpenFin’s **page tab** row uses `brandPrimary` as fill; labels often use **`textDefault`** (dark in light mode), not `brandPrimaryText`.

To avoid dark-on-blue unreadable tabs:

- Lighten `brandPrimary` toward `background1` (~38% primary / 62% page bg).
- Set `brandPrimaryText` from `textDefault` with WCAG contrast ≥ 4.5 on the softened tab fill.

Dark mode uses `finalizeDarkChromePalette` (light on-primary text on saturated primary).

### 4.5 Platform init (`workspace.ts`)

```ts
const { dark, light } = buildOpenFinPalettesFromDesignSystem();
await init({
  browser: {
    defaultWindowOptions: {
      backgroundColor: /* active scheme background1 — reduces load flash */,
    },
  },
  theme: [{
    label: 'Default',
    default: 'dark',
    palettes: {
      dark: applyDarkPaletteOverrides(dark, config.theme),
      light: { ...light, brandPrimary: config.theme?.brandPrimary ?? light.brandPrimary },
    },
  }],
});
```

Palettes are registered **once** at init. A full platform restart is required after palette logic changes.

### 4.6 Theme toggle flow

```
User clicks dock theme button (Dock3 launchEntry inline — do not route through customActions)
  → platform.Theme.setSelectedScheme(Light|Dark)   // OpenFin chrome (fire-and-forget)
  → html data-theme + starui:theme localStorage
  → applyDock3Config()                             // dock icon variants
  → IAB theme-changed                              // child views / OpenFinRuntime
```

Content grids also set `data-ag-theme-mode` when theme changes.

### 4.7 Fallback palettes

If CSS is missing at init, `FALLBACK_OPENFIN_DARK_PALETTE` / `FALLBACK_OPENFIN_LIGHT_PALETTE` in `openfinPalette.ts` mirror OpenFin’s reference hex ramps (`#0A76D3` brand). Prefer fixing CSS load order over relying on fallbacks.

### 4.8 Persisted workspace layouts (`seed.json`)

`apps/source/star-demo/public/seed.json` may contain `_themeData.themes` with legacy hex palettes. That affects **saved layout chrome**, not the live `init()` palettes. After a palette migration, re-export seed or accept that old layouts carry stale `_themeData` until re-saved.

---

## 5. App-level CSS bridge (optional)

Some demos map OpenFin-injected vars to StarUI tokens:

```css
/* apps/source/star-demo/src/index.css */
:root {
  --of-bg: var(--theme-background-primary, var(--ds-surface-ground));
  --of-fg: var(--theme-text-default, var(--ds-text-primary));
}
```

OpenFin may expose `--theme-*` on workspace surfaces; hosted apps still rely primarily on `data-theme` + `@wellsfargo-starui/design-system/css`.

---

## 6. Build / install pitfalls

### Missing `@wellsfargo-starui/design-system` during `build:packages`

Symptom: `TS2307: Cannot find module '@wellsfargo-starui/design-system'`.

Cause: `npm run propagate` used to delete root `node_modules/@wellsfargo-starui/design-system` when refreshing app tarballs.

Fixes in repo:

- `scripts/propagate.mjs` — does not remove workspace symlinks under root `node_modules`.
- `scripts/ensure-workspace-links.mjs` — runs before `build:packages`.
- Root `devDependencies` pin `@wellsfargo-starui/design-system`, `@wellsfargo-starui/shared-types`, `@wellsfargo-starui/types`, `@wellsfargo-starui/icons-svg`.

### Tailwind preset not found in apps

Symptom: `Cannot find module '@wellsfargo-starui/design-system/tailwind'` from PostCSS.

Use `scripts/staruiTailwindPreset.cjs` in app `tailwind.config.js` (see § 2.4).

---

## 7. Future upgrade checklist

### Design system token drop

- [ ] Update `starui-tokens.css` (+ `tokens.json` if used)
- [ ] Run `npm test -w @wellsfargo-starui/design-system` (fix compat snapshots if intentional)
- [ ] Run `npm run build:packages`
- [ ] Grep for hardcoded hex in `packages/react-ui/ui` and grid customizer
- [ ] Verify `applyTheme` + AG Grid dark headers in star-demo
- [ ] `npm run propagate -- design-system` + `npm run install:apps` for tarball consumers

### OpenFin palette / chrome

- [ ] Provider imports `@wellsfargo-starui/design-system/css` **before** `initWorkspace()`
- [ ] Restart OpenFin completely after `openfinPalette.ts` changes
- [ ] Toggle light: dock + browser tabs + content all flip
- [ ] Check active **page tab** contrast (top “Untitled Page” tab)
- [ ] Check light dock dropdown (`contentBackground4`) — cancel buttons legible
- [ ] Run `npm test -w @wellsfargo-starui/openfin-platform` (`openfinPalette.test.ts`)

### Optional hardening

- [ ] Update `FALLBACK_OPENFIN_*` if reference ramps change materially
- [ ] Re-export `seed.json` if `_themeData` palettes should match new chrome
- [ ] Update `docs/current-features.md` bullets for design-system / openfin-platform

---

## 8. Key file index

```
packages/design-system/design-system/
  src/tokens/starui-tokens.css      # OKLCH source tokens
  src/adapters/compatCss.ts         # --ds-* / --bn-* bridges
  src/adapters/tailwind.ts          # Tailwind preset
  src/adapters/agGrid.ts            # AG Grid v33 theme
  src/applyTheme.ts                 # data-theme / localStorage
  scripts/build-css.ts              # dist/css/theme.css
  dist/css/theme.css                # App @import target

packages/openfin/openfin-platform/
  src/openfinPalette.ts             # CSS → CustomPaletteSet
  src/workspace.ts                  # init({ theme })
  src/dock.ts                       # theme toggle (Dock3)

scripts/
  staruiTailwindPreset.cjs          # PostCSS-safe preset loader
  ensure-workspace-links.mjs        # Pre-build workspace symlinks

apps/source/star-demo/
  src/main.tsx                      # applyTheme before provider
  src/index.css                     # @import design-system/css
  src/platform/Provider.tsx           # initWorkspace()
```

---

## 9. What OpenFin chrome cannot do via palettes

| Surface | Palette-controlled? | Notes |
|---------|---------------------|--------|
| Dock bar, dropdowns, browser **content** tab strip | Yes | `CustomPaletteSet` |
| Hosted React / AG Grid content | No | `data-theme` + CSS |
| Native OS title bar (min/max/close) | Limited | OS theme; `backgroundColor` = load flash only |
| Frameless custom title bar | Custom HTML | `frame: false` in window options |

For native title bar dark mode on Windows, OS / `NativeTheme` applies — separate from Workspace palettes.
