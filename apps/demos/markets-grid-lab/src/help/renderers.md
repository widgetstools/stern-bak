# Cell Renderers — profile-driven visuals

**Six toolbar profiles** (`lab-renderers-v2`) install renderer assignments
through **column-customization** (not hard-coded `colDef.cellRenderer`).
Switch profiles to compare pills-only vs charts vs P&L motion vs plain text.

| Profile | Focus |
| --- | --- |
| **00 · Full showcase** | All registry renderers on one grid |
| **01 · Pills** | Rating + sector exact-match pills |
| **02 · Charts & bars** | Heatmap · percent bars · sparkline |
| **03 · P&L & motion** | Trend arrow · pnl-value · time-since |
| **04 · Flags** | Country + currency flags |
| **05 · Plain text** | Empty — author in Column Settings |

Import [`public/lab-profiles/renderers/`](../../public/lab-profiles/renderers/).

Open `Tools → Column Settings → Cell renderer` on any column to inspect
the persisted `cellRendererId` + config envelope.

Registry reference:
[`@wellsfargo-starui/design-system/cell-renderers-registry`](../../packages/design-system/design-system/src/cellRendererRegistry.ts).

Reset:

```js
localStorage.removeItem('lab-demo-profiles-v2:lab-renderers-v2');
localStorage.removeItem('markets-grid-bundle:lab-renderers-v2');
```

Seed: [`src/seeds/renderers.ts`](../../src/seeds/renderers.ts) ·
catalog [`renderersCatalog.ts`](../../src/profiles/catalogs/renderersCatalog.ts).
