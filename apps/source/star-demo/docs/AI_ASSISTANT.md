# AI Assistant — LLM integration in `star-demo`

A chat assistant that configures MarketsGrid blotters and analyses their data by
calling tools, not by generating code. It lives entirely in
[`src/aiAssistant/`](../src/aiAssistant/) — one `packages/` change aside (the
toolbar wand button, see [Toolbar entry point](#toolbar-entry-point)).

- **48 source modules** + 28 test files, ~15.3k lines under `src/aiAssistant/`
- **44 tools** — 15 read-only, 29 mutating
- App-wide suite: **485 tests across 50 files** (`npx vitest run` in `apps/source/star-demo`)

---

## 1. How a turn works

```
user message
  → useChatSession  builds the request (system prompt + history + TOOL_SCHEMAS)
  → llmClient       POST {baseUrl}/v1/chat/completions
  → model returns tool_calls
  → useToolExecutor dispatches each call against ConfigManager / the data hub
  → tool results appended to history
  → loop until the model returns prose
```

The loop is an ordinary OpenAI-compatible `chat.completions` tool-calling loop.
The default endpoint is a local Copilot-style server at `http://127.0.0.1:3000`;
anything speaking that wire format works. `baseUrl`, `apiKey` and `model`
persist; nothing else about the connection does.

**The model never writes state.** Every mutating handler validates its arguments
the same way the manual UI would, then writes through `ConfigManager`. A tool
call is a request, not an instruction.

### Why tools rather than an MCP server

This was asked and decided: the assistant runs **inside** the app window, where
`ConfigManager`, the Component Registry and the SharedWorker data hub are
already live objects. An MCP server would be a second process that has to
re-acquire all three across a boundary, and OpenFin windows have no stable
address for it to talk back through. In-process tools were the right call for
this deployment; an MCP server becomes interesting if the assistant ever needs
to serve editors or other hosts.

---

## 2. The config model — the part that causes bugs

Almost every "the assistant said it worked but nothing changed" report traces to
this, so it is worth reading before touching a handler.

### Template vs instance

A registry entry's `configId` addresses the component's **template** row
(`isTemplate: true`). Launching a blotter from the dock does **not** read that
row — [`openfin-platform/src/launch.ts`](../../../../packages/openfin/openfin-platform/src/launch.ts)
mints a per-window instance id and eagerly **clones** the
template into a fresh `isTemplate: false` row, after which the view reads only
its own row.

So a write to the template alone reaches singleton blotters (same row) and
windows opened *afterwards* — but never a non-singleton blotter that is already
open. Blotters the assistant creates are `singleton: false`, so multi-window is
the normal case.

**Every mutation therefore fans out** across the template and each live instance
([`gridProfiles.ts`](../src/aiAssistant/gridProfiles.ts) → `resolveWriteTargets`,
`patchGridModule`). The update callback runs against each row's own previous
state, so an instance keeps its local customisations and still gets the change.

### Profiles

`activeProfileId` lives on the **view's** customData, not in the config row, and
the localStorage fallback is keyed by `gridId` — shared by every blotter on a
route. So it cannot be discovered from the assistant window.
[`useLiveProfileSync.ts`](../src/useLiveProfileSync.ts) publishes it into the
row's grid-level data; `readActiveProfile` reads it back.

This matters: editing `__default__` while the user has "L1" selected writes
changes they will never see. `__default__` is the platform's reserved id —
seeding anything else makes `ProfileManager.boot()` create a second, invisible
"Default".

### Scope: blotter vs window

Two ambient values, deliberately different, carried through one tool call by
`withGridScope`:

| | meaning | effect |
|---|---|---|
| `focusInstanceId` | the window the request came **from** | a *hint* — writes still fan out, this row is merely guaranteed included |
| `pinnedInstanceId` | the window the request is **about** | a *boundary* — reads come from that row, writes go there alone |

The hint exists because instance discovery is visibility-filtered and can omit
the very window the user is looking at. The pin is set when a caller names a
window — either `instanceId` alongside `targetGridId`, or a `targetGridId` that
*is* a window id (what a model does straight after `list_grid_instances`).

**A pinned write skips the template on purpose.** Including it would leak the
change into every window opened later — the opposite of "just this one". That is
a footgun if silent, so `describeFanOut` says it in the tool result.

---

## 3. Module map

### Transport and session

| File | Role |
|---|---|
| `llmClient.ts` | `chat.completions` POST, streaming, `fetchModels`, `checkHealth` |
| `chat/useChatSession.ts` | the turn loop, message history, tool-activity collection |
| `systemPrompt.ts` | the whole system prompt, built per panel (scoped or general) |
| `chat/sessionStore.ts` | localStorage persistence; **strips attachment payloads** (base64 blows the ~5 MB quota) |
| `chat/attachments.ts` | image/file attachment encoding |
| `chat/starters.ts` | empty-state prompt chips, scoped and general variants |

### Tool surface

| File | Role |
|---|---|
| `tools.ts` | the `ToolName` union and `READ_ONLY_TOOLS` — the vocabulary |
| `toolSchemas.ts` | wire schemas (split for the 800-line ceiling) |
| `columnToolSchemas.ts` | the column-mutation schemas |
| `toolSchemaShared.ts` | `OpenAIToolSchema`, `TARGET_GRID_ID_PROPERTY`, `INSTANCE_ID_PROPERTY` |
| `useToolExecutor.ts` | dispatch, scope enforcement, `resolveInstancePin`, `applyGridScope` |
| `toolResult.ts` | the shared `ToolExecutionResult` (its own module to break an import cycle) |

### Config access

| File | Role |
|---|---|
| `gridProfiles.ts` | template/instance fan-out, scope, active-profile reads — **the core** |
| `registryOps.ts` | Component Registry and dock-button CRUD |
| `blotterTools.ts` | create / open / rename / delete a blotter, bind a provider |
| `profileTools.ts` | profile CRUD and switching |
| `providerTools.ts` | data-provider CRUD, `get_grid_columns`, `describe_data_fields` |
| `moduleCollections.ts` | the 17 customizer modules and their 10 addressable collections |
| `moduleItemTools.ts` | generic item CRUD across every collection-shaped module |
| `launchComponent.ts` | dynamic import of `@wellsfargo-starui/openfin` — a static import throws outside OpenFin |

### Columns

| File | Role |
|---|---|
| `columnResolver.ts` | **name → colId.** Accepts the id, the header on screen, or a loose form |
| `columnCatalog.ts` | bare column ids, for checking expression references |
| `columnStyle.ts` | `set_column_style` arguments: typography, colours, borders, formats, renderers |
| `columnBehavior.ts` | `set_column_behavior`: cell editors, filters, grouping flags, templates |
| `columnStyleTools.ts` | the two handlers behind those |
| `simpleColumnTools.ts` | `rename_column`, `set_column_visibility` — the two most common asks |
| `gridLayout.ts` / `layoutTools.ts` | order / hide / pin / width, and row grouping |
| `cellRenderers.ts` | 24-renderer catalogue, kept honest by a parity test |
| `ruleFeatures.ts` | conditional-styling flash / indicator / animation validation |

### Data analysis

| File | Role |
|---|---|
| `dataAccess.ts` | gets real rows from the SharedWorker hub; **carries provenance** |
| `dataDigest.ts` | statistics — totals, means, medians, categories, highlights |
| `dataQuery.ts` | the query language: filter, group, aggregate, sort, limit |
| `dataTools.ts` | `summarize_grid_data`, `query_grid_data`, the `DataCellPayload` |
| `chartSpec.ts` | picks the chart from the result's shape; owns the colour ramp |
| `chat/DataChart.tsx` | renders bar / hbar / line / area / pie / scatter |
| `chat/DataResultCell.tsx` | the notebook-style output cell |

### Support

| File | Role |
|---|---|
| `featureGuides.ts` | on-demand worked examples, lifted from `markets-grid-lab` seeds |
| `diagnostics.ts` | `diagnose_grid` — one walk of the whole chain |
| `undo.ts` / `useUndoStack.ts` | per-turn profile snapshots; `IRREVERSIBLE_TOOLS` |
| `providerColumns.ts` | field inference via `probeMock` |
| `ensureDockButton.ts` | dock registration for the assistant itself |

---

## 4. Reading real data

The assistant window sits inside `<DataHubProvider>`, so
`useDataServices().client` is the **same SharedWorker hub every open blotter is
attached to**. When the provider is running, a snapshot is a cache replay — the
assistant sees exactly the rows on screen, with no upstream fetch.

### Provenance is load-bearing

`probeMock` can generate plausible positions offline, but its values are
**unseeded random**. Summarising them describes numbers the user has never seen,
which is worse than no answer. So:

- the source (`live` | `sample`) travels with the rows and every caller handles it;
- a stopped provider is **never started** to answer a question — subscribing
  would open a STOMP socket as a side effect, and the rows still wouldn't be the
  ones on screen;
- `allowSample` is opt-in, and the sample is labelled `GENERATED` in the tool
  result, in the system prompt's instructions, and visually in the output cell.

### The arithmetic is done in code

A blotter holds thousands of 250-field rows. They don't fit in context, and a
model asked to total a column produces a confident wrong number. `dataDigest`
and `dataQuery` compute exactly and deterministically; the model narrates. The
prompt tells it to quote the numbers and never recompute them.

### Charts

`buildChartSpec` picks from the shape of the result, not by asking the model:

| shape | chart |
|---|---|
| a few positive buckets | pie (with legend) |
| dated or ordered key | line |
| long labels, or many categories | horizontal bar |
| a middling set of short labels | bar |
| two numeric columns over raw rows | scatter |

A `chart` argument overrides it; `none` suppresses. Colours are
`--ds-chart-1`…`--ds-chart-5`, cycled per point — **deliberately not `--primary`
or `--accent`**: primary is the app's interactive blue and accent is a surface
tint, so data drawn in either reads as chrome. Use the `--ds-*` form; the bare
`--chart-N` tokens are unwrapped oklch triplets and render as an invalid fill.

---

## 5. Toolbar entry point

The one `packages/` change. `PrimaryToolbar` takes an optional
`onOpenAssistant`, rendering a `Wand2` ghost button as the **last** child of
`ds-primary-actions-trailing`, threaded from `MarketsGrid` → `MarketsGridHost`.

It is deliberately *not* an `adminAction`: under
`toolbarActionsLayout: 'overflow'` those collapse into a menu, and the ask was a
button pinned to the toolbar's right edge. Omitted by consumers who don't pass
the prop, so nothing changes for other apps.

Clicking it opens `/#/ai-assistant?grid=<id>&scope=locked` in its own window
(`windowName: 'ai-assistant-' + gridId`, so two blotters get two windows). In
scoped mode the panel shows the blotter id, hides the grid picker, and
`applyGridScope` **enforces** the boundary in the executor — a model that
ignores the prompt still cannot reach another blotter.

Files: `PrimaryToolbar.tsx`, `MarketsGrid.tsx`, `MarketsGridHost.tsx`,
`types.ts` (all `packages/react-grid/grid/src/widget/`), plus
`views/BlottersMarketsGrid.tsx` and `views/AiAssistant.tsx` in the app.

---

## 6. Conventions worth keeping

1. **A tool that can't be found doesn't exist.** Names carry the user's verb —
   `rename_column`, not "use `set_column_style` with `headerName`". The rename
   and hide/show tools exist because the general ones were never reached for.
2. **Refuse rather than guess.** An ambiguous column name is rejected naming
   both candidates; a dangling template id is rejected; an unknown renderer is
   rejected. Writing something inert is the worst outcome, because nothing
   errors and the user just sees "nothing happened".
3. **Say where the change landed.** `describeFanOut` reports the instance count,
   the profile edited, and whether the write was window-only.
4. **Three lists must agree** — `ToolName`, the schemas, and the executor
   switch. `tools.test.ts` enforces it: a name with no schema means the model
   never learns the tool exists.
5. **800 lines per file.** `toolSchemas`, `useToolExecutor` and the big test
   files have each been split once already; keep splitting rather than growing.

---

## 7. Testing

```bash
cd apps/source/star-demo
npx vitest run src/aiAssistant     # the assistant alone
npx vitest run                     # the whole app
npx tsc -p tsconfig.app.json  --noEmit
npx tsc -p tsconfig.test.json --noEmit
```

Two environment notes that will otherwise cost an afternoon:

- **`tsconfig.app.json` is `composite`/incremental.** A clean result can be
  cached. Delete `node_modules/.tmp/tsconfig.app.tsbuildinfo` before trusting
  it — a stale cache hid a real `main.tsx` error through most of this work.
- **recharts is mocked in component tests.** `apps/` is a separate install root
  from the repo root, so both carry a React; recharts is reached via
  `@wellsfargo-starui/react/chart` under the repo root and binds the *root*
  React while react-dom binds the `apps/` one — two Reacts, null hook
  dispatcher. The app is unaffected (`staruiConsumerViteConfig` aliases and
  dedupes, and `vite build` passes); vitest externalizes to Node's resolver,
  which never consults those aliases. `apps/source/design-system` does the same
  thing in its own setup.

---

## 8. Known limits

- **Nothing here is verified end to end against a live OpenFin session or a
  running LLM server.** Coverage is unit-level plus invariants copied from the
  engine's own reducers.
- **Auto Format is unreachable.** It walks the live field catalogue, which needs
  a running grid. The guide says so and points at `describe_data_fields` plus
  per-column formats as the honest equivalent.
- **Undo covers profile-level changes only.** Registry, dock and data-provider
  mutations are separate stores with no snapshot; `IRREVERSIBLE_TOOLS` reports
  them rather than appearing to work.
- **Reading data needs the blotter open.** By design — see
  [§4](#4-reading-real-data).
- **Bundle size.** The AI Assistant route chunk is ~1.02 MB, mostly recharts.
  It is lazy-loaded, so this is a first-open cost.

---

## Related

- [`README.md`](../README.md) — the app itself
- [`docs/APPS_REPO.md`](../../../../docs/APPS_REPO.md) — how `apps/` consumes the platform
- [`CLAUDE.md`](../../../../CLAUDE.md) — repo conventions (file naming, ceilings, UI stack rules)
- `apps/source/markets-grid-lab` — the reference app the feature guides were lifted from
