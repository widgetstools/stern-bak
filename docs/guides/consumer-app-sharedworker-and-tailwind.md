# Consumer apps: SharedWorker + Tailwind pitfalls

Reference for apps under `apps/*` that consume `@wellsfargo-starui/*` bucket tarballs via Vite
(`staruiConsumerVite.mjs`, `staruiConsumerAliases.mjs`, `tailwindContentGlobs.mjs`).

This documents issues hit in `markets-ui-react-reference` (OpenFin workspace) after the
repo flatten and bucket-tarball migration, and the patterns that prevent recurrence.

---

## SharedWorker (`@wellsfargo-starui/host-data`)

### Symptoms

| Console / behaviour | Likely cause |
|---|---|
| `Failed to fetch a worker script` | Worker URL points at a prebundled `.vite/deps/` chunk or tarball `dist/` path Vite cannot serve as a worker entry |
| `[@wellsfargo-starui/host-data] SharedWorker error event` | Worker script failed to load or threw during boot |
| Blank page / infinite loading on routes using data services | `appData.ready()` never resolves → `ConfigManager.init()` hangs → `StarGridApp` returns `null` |
| `useDataServices must be inside <DataServicesProvider>` | Duplicate `@wellsfargo-starui/host-data-react` module from Vite prebundle (broken React context) |

### Root causes (there were three)

#### 1. Prefer platform bootstrap + bundled worker asset

`@wellsfargo-starui/host-data` ships a self-contained worker at
`dist/assets/data-services-worker.mjs`. Import its URL at the **app call site**
with Vite's `?url` suffix, then call `ensurePlatformReady`:

```ts
// public/app-config.json — { "appId": "my-app", "userId": "dev1", "useRest": false }
import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
} from '@wellsfargo-starui/host-data';
import workerAssetUrl from '@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url';

const config = await resolvePlatformBootstrapFromJson('/app-config.json');
export const platform = await ensurePlatformReady(config, { workerScriptUrl: workerAssetUrl });
```

Wrap the React tree in `<DataHubProvider platform={platform} userId={config.userId}>`.

OpenFin apps use manifest `customSettings.appId` / `userId` instead — see
[`platform-bootstrap-config.md`](./platform-bootstrap-config.md).

**Legacy:** `bootstrapDataServicesWithWorkerAsset({ appName, userId })` still works
but is deprecated; migrate to `ensurePlatformReady`.

See:

- `apps/demos/stomp/src/platformBootstrap.ts`
- `apps/demos/markets-grid-lab/src/platformBootstrap.ts`

**Do not** use `createDataServicesClient()` in Vite apps — its
`new URL(..., import.meta.url)` lives inside the library and breaks once
Vite prebundles `@wellsfargo-starui/host-data` into `.vite/deps/`.

**Legacy escape hatch:** app-local `sharedWorker/entry.ts` that calls
`installSharedWorkerHub` + `bootstrapDataServices({ worker, ... })` when
you need bespoke worker wiring beyond the default hub.

Pass REST config to the worker via query param on the script URL (main thread reads
OpenFin manifest once; worker reads `self.location.search`):

```ts
// handled by bootstrapDataServicesWithWorkerAsset / createDataServicesWorker
configServiceRestUrl: await getConfigServiceRestUrlFromManifest()
```

#### 2. Worker boot race — register `onconnect` before any `await`

When the main thread runs `new SharedWorker(...)`, the browser fires `connect`
immediately. If the worker entry does:

```ts
await configManager.init();
await installSharedWorkerHub({ configManager }); // onconnect registered here — TOO LATE
```

…the first port is **dropped**. Main thread sends `appdata-attach`; hub never receives it;
`appData.ready()` hangs forever.

**Fix (app worker entry):**

```ts
const configManager = createConfigManager({ ... });
const installed = installSharedWorkerHub({ configManager }); // sync: registers onconnect
await configManager.init();
await installed;
```

**Fix (library — `@wellsfargo-starui/host-data`):** `installSharedWorkerHub` registers `onconnect`
synchronously and queues ports until `hydrateAppData()` completes. After changing
`packages/data/host-data`, run `npm run propagate -- data` so installed tarballs pick up
the new `dist/`.

#### 3. Vite `optimizeDeps` must exclude host-data packages

Prebundling breaks worker URLs **and** duplicates React context for `host-data-react`.

In `scripts/staruiConsumerAliases.mjs` → `staruiOptimizeDeps().exclude`:

- `@wellsfargo-starui/host-data`, `@wellsfargo-starui/host-data/runtime`
- `@wellsfargo-starui/host-data-react`, `@wellsfargo-starui/host-data-react/runtime`
- Bucket paths: `@wellsfargo-starui/data/host-data`, `@wellsfargo-starui/data/host-data-react`, etc.

Apps must pass `{ worker: true }` to `staruiConsumerViteConfig`:

```ts
const staruiPartial = staruiConsumerViteConfig(appDir, { worker: true });
```

### Route layout (OpenFin tool windows)

Tool routes (`/dataproviders`, `/config-browser`, `/workspace-setup`, …) should **not**
be wrapped in `<StarGridApp>`. They only need `<DataHubProvider>` (or legacy
`<DataServicesProvider>` during migration).

Grid/workspace views (`/blotters/marketsgrid`, `/views/view1`, …) keep the
`StarGridApp` shell under the same hub provider ancestor.

### Checklist — new app using data services

1. [ ] `vite.config.ts` uses `staruiConsumerViteConfig(appDir, { worker: true })`
2. [ ] `public/app-config.json` with stable `appId` + `userId` (or OpenFin manifest `customSettings`)
3. [ ] `src/platformBootstrap.ts` calls `ensurePlatformReady`
4. [ ] `<DataHubProvider platform={...}>` wraps the app tree
5. [ ] Stable worker `name`: `mkt-data-services:<appId>` (from bootstrap config)
6. [ ] After library changes: `npm run propagate -- data` + clear `.vite` cache
7. [ ] Tool routes outside `StarGridApp`; single hub provider ancestor for editors

### Debugging

**Browser / Vite dev**

```bash
rm -rf apps/<app>/node_modules/.vite
npm run dev --workspace=apps/<app>
```

Network tab: worker script should be something like  
`http://localhost:5174/src/sharedWorker/entry.ts` — **not** `.vite/deps/chunk-*.js`.

**OpenFin** (see `apps/markets-ui-react-reference/public/platform/manifest.fin.json`)

- Remote debugging: `--remote-debugging-port=9090` + `devtools_port: 9090`
- Chrome → `chrome://inspect` → configure `localhost:9090`
- Look for SharedWorker named `mkt-data-services:<app-id>`
- Worker console should log `ConfigManager initialised` and `hub waiting for ports`

**Quick sanity check**

```ts
await dataServices.ready; // must resolve, not hang
```

---

## Tailwind CSS

### Symptoms

| Symptom | Likely cause |
|---|---|
| PostCSS / Tailwind config load error mentioning `import.meta` | ESM-only code imported from `tailwind.config.js` (jiti cannot evaluate it) |
| Library UI unstyled (missing utilities in `@wellsfargo-starui/ui`, grids, widgets) | `content` globs don't scan tarball paths under `node_modules/@wellsfargo-starui/...` |
| Styles worked before flatten/tarball migration, broken after | Stale relative paths (e.g. old `starui-platform/packages/...`) in `content` |
| Vite warning: `duration-[120ms] is ambiguous` | Fixed in `@wellsfargo-starui/grid` — use `[transition-duration:120ms]` instead of `duration-[120ms]` if you copy customizer classes |

### Root cause: PostCSS loads Tailwind config through jiti

Tailwind 3 loads `tailwind.config.js` via PostCSS → **jiti**, which does **not** support
`import.meta` or other ESM-only constructs in the config graph.

**Do**

- Keep `postcss.config.cjs` as **CommonJS** (`.cjs` extension).
- Import static content globs from `scripts/tailwindContentGlobs.mjs` (relative paths
  only — no runtime `import.meta.url` resolution in the config file itself).
- Use `platformAppTailwindContent` / `demoAppTailwindContent` from that file.

**Don't**

- Import `staruiConsumerAliases.mjs` or anything that uses `import.meta` from
  `tailwind.config.js`.
- Use dynamic glob builders that rely on `import.meta.url` inside Tailwind config.

Example (`apps/markets-ui-react-reference/tailwind.config.js`):

```js
import { tailwindPreset } from '@wellsfargo-starui/design-system/tailwind';
import { platformAppTailwindContent } from '../../scripts/tailwindContentGlobs.mjs';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    ...platformAppTailwindContent,
  ],
};
```

`postcss.config.cjs` should include `tailwindcss/nesting` before `tailwindcss` when Monaco
/ nested CSS is pulled in (see `apps/markets-ui-react-reference/postcss.config.cjs`).

### Root cause: tarball installs change where source lives

Apps depend on bucket tarballs (`file:../../libs/starui-react-ui-….tgz`). Tailwind must
scan **both**:

1. Monorepo workspace paths (`packages/react-ui/ui/src/...`) — for dev against source
2. Installed bucket paths (`node_modules/@wellsfargo-starui/react-ui/ui/src|dist/...`) — for tarball
   layout

`scripts/tailwindContentGlobs.mjs` lists both. When adding a new package with Tailwind
classes:

1. Add workspace glob under `packages/...`
2. Add matching `node_modules/@wellsfargo-starui/<bucket>/<member>/...` globs (src **and** dist when
   the package ships compiled JS)

For dynamic resolution (optional), `scripts/staruiTailwindContent.cjs` builds absolute
globs from the app directory — **CommonJS only**, safe for PostCSS.

### Checklist — Tailwind in a consumer app

1. [ ] `tailwind.config.js` uses `tailwindPreset` from `@wellsfargo-starui/design-system/tailwind`
2. [ ] `content` includes `./src/**` + `platformAppTailwindContent` (or `demoAppTailwindContent`)
3. [ ] `postcss.config.cjs` (not `.js` with `"type": "module"` pitfalls)
4. [ ] No `import.meta` in the Tailwind config import graph
5. [ ] After adding/changing a UI package: update `scripts/tailwindContentGlobs.mjs`
6. [ ] After `npm run propagate`: restart dev server (Tailwind caches file scans in dev)

### After structural changes (flatten, tarball migration, path moves)

1. Search for stale paths: `starui-platform/`, wrong `../` depth in tailwind globs
2. Clear Vite cache: `rm -rf apps/<app>/node_modules/.vite`
3. Restart dev server on the port OpenFin manifest expects (`5174` for reference app)
4. Verify a known utility from `@wellsfargo-starui/ui` (e.g. shadcn `border-border`) appears in
   compiled CSS in DevTools

---

## Related scripts

| Script | Purpose |
|---|---|
| `scripts/staruiConsumerVite.mjs` | Shared Vite partial; pass `{ worker: true }` for SharedWorker apps |
| `scripts/staruiConsumerAliases.mjs` | Tarball aliases, React dedupe, `optimizeDeps.exclude` |
| `scripts/tailwindContentGlobs.mjs` | Static Tailwind `content` globs (PostCSS-safe) |
| `scripts/staruiTailwindContent.cjs` | Dynamic absolute globs (CJS; optional) |
| `npm run propagate -- <bucket>` | Repack tarball after library changes |

---

## Quick recovery command block

When either SharedWorker or Tailwind behaves oddly after a big repo change:

```bash
# Repack libraries you changed
npm run propagate -- data react-core

# Clean Vite prebundle (fixes worker URL + duplicate React context)
rm -rf apps/markets-ui-react-reference/node_modules/.vite

# Single dev server on the manifest port
lsof -ti :5174 | xargs kill -9 2>/dev/null || true
npm run dev:openfin:markets-react
```
