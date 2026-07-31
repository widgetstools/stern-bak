# Consuming `@wellsfargo-starui/*` outside this repo

For teams **without access to this repository**, installing the packages
from Artifactory (or from `file:` tarballs). Everything below is verified
end-to-end by a scratch app built outside the workspace with **no** Vite
aliases, **no** `tsconfig` paths, and **no** Tailwind/PostCSS config.

## 1. Install

Packages publish **individually**, under their real names:

```bash
npm install @wellsfargo-starui/grid @wellsfargo-starui/widgets-react \
            @wellsfargo-starui/design-system @wellsfargo-starui/engine
```

Their `@wellsfargo-starui/*` dependencies resolve transitively — you only
name the ones you import. Peer dependencies you must supply yourself:

| Peer | Range | Needed by |
|---|---|---|
| `react`, `react-dom` | `^19.2.5` | every React package |
| `ag-grid-community` / `-enterprise` / `-react` | `^35.1.0` | `grid`, `widgets-react` (enterprise licence is yours to install) |
| `lucide-react` | `^0.554.0` | `grid`, `widgets-react`, `ui` |
| `@tanstack/react-query` | `^5.80.0` | `widgets-react` |
| `@openfin/*` | `23.0.20` / `43.101.2` — **optional** | only for OpenFin hosting |
| `tailwindcss` | `^3.4.1` — **optional** | only if you integrate our preset into your own Tailwind build (see §3) |

`npm install` resolves cleanly — no `--force`, no `--legacy-peer-deps`.

`@stomp/stompjs` is **not** a peer — it is a normal dependency of
`host-data`, so it installs itself.

The `@openfin/*` peers are **optional**: a browser-only consumer installs
**zero** OpenFin packages (verified — `node_modules/@openfin` is absent).
The config surfaces that browser apps use (`config-browser`,
`host-wrapper-react`) reach OpenFin only through
`@wellsfargo-starui/openfin-platform/config`, a subpath whose graph contains
`import type` references alone. Install the three `@openfin/*` packages only
when you actually host inside an OpenFin window.

## 2. Styling — one import, zero configuration

```ts
import '@wellsfargo-starui/design-system/styles.css';
```

That single stylesheet carries the design tokens, self-hosted `@font-face`
rules, **every shipped component's compiled utility classes**, and the grid's
chrome CSS. You do **not** need `tailwindcss`, `postcss`, a
`tailwind.config.js`, `content` globs pointing into `node_modules`, or the
`* { @apply border-border }` base rule.

### It does not restyle your markup

`styles.css` ships **no global document reset**. This is the MUI
`CssBaseline` / Chakra `resetCSS` convention: a library has no business
rewriting your `h1` margins or list markers. Verified in a browser — with
only `styles.css` imported, a consumer's own `<h1>` keeps its `17.42px`
margin and `<ul>` keeps `disc` / `40px`.

It does carry a handful of rules our utilities are mechanically useless
without, all inside an `@layer wf-base` so **any** unlayered rule of yours
wins:

- `box-sizing`, `border-width: 0`, `border-style: solid` on `*` — Tailwind's
  `border-*` utilities set width only, so without these a `border` class
  renders nothing.
- typography inheritance on `button`/`input`/`select`/`textarea` — form
  controls do not inherit type from ancestors (our Button rendered in Arial
  without this). This is the one place the sheet touches your own elements.

If your app has no reset of its own, opt into the full normalisation:

```ts
import '@wellsfargo-starui/design-system/reset.css';   // optional
```

Skip it if you already run Tailwind preflight, normalize.css, or your own.

Set the theme by stamping the root element (dark is the default):

```html
<html data-theme="dark">   <!-- or data-theme="light" -->
```

### Fonts

Inter and JetBrains Mono are **self-hosted inside the package** — variable
`woff2`, latin + latin-ext, subsetted with Fontsource's own `unicode-range`
values, shipped under `dist/fonts/` with their OFL-1.1 licences. Your
bundler emits them as ordinary assets.

There is **no CDN request** — no `fonts.googleapis.com`, nothing for a
corporate CSP or egress proxy to block. Verified in a browser: both families
report `loaded`, and the page issues **zero** external requests.

## 3. Advanced: integrating with your own Tailwind build

Only if you want purged/tree-shaken CSS instead of the prebuilt bundle:

```js
// tailwind.config.js
import { tailwindPreset } from '@wellsfargo-starui/design-system/tailwind';
export default {
  presets: [tailwindPreset],
  content: [
    './src/**/*.{ts,tsx}',
    './node_modules/@wellsfargo-starui/*/dist/**/*.js',
  ],
};
```

Then import `@wellsfargo-starui/design-system/css` (tokens only) instead of
`styles.css`, and add the `@tailwind` directives yourself. This path requires
`tailwindcss@^3.4.1`.

Both paths are verified against a client app that runs its **own** Tailwind:
the client's `theme.extend` values and utilities are generated normally, our
components' utilities come from the `dist` scan, and our design tokens
resolve. Importing `styles.css` *while* also running your own Tailwind is
supported too — the duplicate utilities dedupe during minification — but the
preset path above produces the smaller, purged bundle.

## 4. Bundler support

Every package ships compiled `dist/` ESM with fully-specified relative
specifiers and co-located `.d.ts`, so Vite, webpack, Next, Rollup, esbuild
and plain `tsc` all resolve them. Nothing requires transpiling
`node_modules`.

### The SharedWorker data plane needs no configuration

```ts
await ensurePlatformReady(config);   // that's it
```

`workerScriptUrl` is **optional**. Omitted, the library resolves its own
worker with the idiom every bundler statically detects:

```ts
new SharedWorker(new URL('../../assets/data-services-worker.mjs', import.meta.url),
                 { type: 'module' })
```

Vite, webpack 5, Next, Rollup and Parcel each emit the worker themselves.
Verified end-to-end in a browser: `vite build` emits
`assets/data-services-worker-<hash>.js`, the page fetches it, and the
`SharedWorker` constructs — with no config file touched.

That URL points at the **pre-built, self-contained** worker bundle on
purpose. Pointing it at the unbundled source entry made `vite build` fail
outright for consumers:

> `Invalid value "iife" for option "worker.format" — UMD and IIFE output
> formats are not supported for code-splitting builds.`

Vite's default `worker.format` is `iife`; the source graph reaches a lazy
`import('@stomp/stompjs')`, which forces code-splitting. A library cannot
set `worker.format` on your behalf, and making that import static would drag
stompjs into every consumer's **main** bundle. The shipped asset has stompjs
inlined and zero dynamic imports, so nothing needs splitting.

**One caveat — Vite dev only.** Vite prebundles bare `node_modules` imports
into `.vite/deps/`, which relocates the module and breaks the relative
`import.meta.url` resolution. A package cannot opt itself out of Vite's
optimizer, so Vite **dev** users add one line:

```js
// vite.config.ts
optimizeDeps: { exclude: ['@wellsfargo-starui/host-data'] }
```

`vite build` and every other bundler need nothing. (A Blob-URL worker would
avoid even that, but is not viable for a *Shared*Worker: each
`createObjectURL` yields a distinct URL, so every window would get its own
worker instead of sharing one hub.)

Passing an explicit URL still wins, and remains right for CDN, OpenFin
manifest, or plain `<script>` hosting where you serve the asset directly:

```ts
import workerUrl from '@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url';
await ensurePlatformReady(config, { workerScriptUrl: workerUrl });
```

## 5. Publishing (maintainers)

```bash
npm run build          # build every package's dist
npm run pack:npm       # → dist-npm/*.tgz + manifest.json
```

`pack-npm.mjs` stages each package, drops `private: true`, and rewrites
workspace `"*"` ranges to concrete `^version` values so the graph resolves
from a registry. Publish the tarballs in dependency order (the manifest is
alphabetical; npm resolves order itself on a registry).

> `npm run propagate` is the **in-repo** flow — it packs one tarball per
> architecture bucket for the demo apps and renames members to bucket
> subpaths. Those tarballs are not suitable for external teams; use
> `pack:npm`.
