# AI Assistant — LLM integration in `star-demo`

A chat assistant that configures MarketsGrid blotters and analyses their data by
calling tools, not by generating code. It lives entirely in
[`src/aiAssistant/`](../src/aiAssistant/) — one `packages/` change aside (the
toolbar wand button, see [Toolbar entry point](#toolbar-entry-point)).

- **55 source modules** + 37 test files under `src/aiAssistant/`
- **49 tools** — 18 read-only, 31 mutating
- App-wide suite: **648 tests across 59 files** (`npx vitest run` in `apps/source/star-demo`)

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

### Blotters the assistant creates are template-backed

`create_blotter` registers a **singleton**, and that one flag is what makes the
component behave the way the assistant needs:

- the launcher skips the template→instance clone, so the window's config row IS
  the template (`launch.ts`: "instanceId === templateId, the view IS the
  template"). Every edit therefore lands on the component's template config and
  survives closing the window;
- the assistant writes the row the window is reading, so `useLiveProfileSync`
  re-applies it with **no reload**;
- re-launching **focuses** the open window instead of spawning a second copy
  that would immediately drift from the first.

The trade-off is intended: one window per blotter. A user who wants two views
makes two blotters — two windows of one blotter would each own a cloned row,
which is the drift this avoids.

A pinned singleton is a case worth knowing about: its window id equals the
template id, so `resolveWriteTargets` marks that write `isTemplate: true`.
Stamping it `false` would rewrite the template's own identity and strip its
singleton flag, and the row would stop describing itself as the template.

Blotters created before this, or outside the assistant, may still be
multi-instance; the fan-out across template + instances still covers them.

### What needs a reload, and what reloads itself

Almost nothing. A profile, module or column write lands in the row the open
grid is reading and re-applies live — so no tool should tell the user to
reopen, and the prompt says so explicitly.

Two changes genuinely cannot be applied live, because the container reads them
once at mount: the provider **binding** (`set_grid_provider`) and a provider's
**column definitions** (`set_provider_columns`). Both call
`reloadOpenComponents`, which reloads the windows the user already has by
matching the launcher's deterministic window name,
`registered-<entryId>-<instanceId>`. Reopening would not do: for a singleton the
launcher focuses without reloading, so a stale feed would survive the trip, and
for a multi-instance blotter it would spawn another window.

`set_provider_columns` edits a PROVIDER, so there is no one blotter to reload —
`reloadBlottersUsingProvider` walks the registry backwards through each
blotter's binding. Views hosted inside a layout aren't reachable this way
(`createView` gets no name); the reported count is always what actually
reloaded, never a guess.

**`reload_grid` is the explicit fallback**, for whenever "should already be
live" isn't good enough — the user reports a change didn't show, or the
assistant wants to be sure after a run of edits. Rather than new plumbing, it
reuses `switch_profile`'s own mechanism
([`profileTools.ts`](../src/aiAssistant/profileTools.ts)): it writes a
`requestedActiveProfileId` / `requestedActiveProfileAt` request into
gridLevelData naming the profile the window is ALREADY on.
`useLiveProfileSync` honours that the same way it honours a real switch, and
`ProfileManager.load()` re-reads from storage and resets the grid's modules
unconditionally — it does not skip on an unchanged id — so requesting the
current profile is a genuine reload, not a no-op. The model is told to reach
for this instead of ever telling a user to switch profiles away and back as a
workaround.

### Grouped and pivot views hide columns

`set_row_grouping` carries all three pivot roles: `groupBy` (rows), `pivotBy`
(columns), `aggregations` (the measures in the cells). There is no separate
pivot tool. A pivot without a row group, without a measure, or with one column
in both dimensions is rejected in `normalizeRowGroupingArgs` rather than
rendering an empty grid.

Turning either view on **hides columns deliberately** (`planGroupedVisibility`):

1. dimension columns — grouped or pivoted columns already show their value in
   the group column / pivot headers, so leaving them in the body repeats it on
   every row;
2. non-numeric columns — a group row is an aggregate, and `cusip` across 400
   positions has no roll-up. Anything in `aggregations` survives whatever its
   declared type, and `hideNonNumeric: false` opts out.

"Numeric" means a DECLARED `cellDataType` of `number` / `currency` / `percent`
(`isNumericColumn`). An undeclared column counts as non-numeric on purpose:
wrongly hiding a measure is a visible one-call fix, wrongly keeping 200 text
columns is the mess the rule exists to prevent.

Three layers are written, and they have to agree: the `grid-state` snapshot
(`columnVisibility`, `rowGroup`, `pivot`), the `column-customization`
assignments (`initialHide`, `rowGroup`/`pivot` flags), and `general-settings`
`pivotMode`, which is what the Settings drawer's toggle reads.

**Reversal is bookkept, not guessed.** The envelope carries
`assistantAutoHiddenColIds` — what THIS view hid — so flattening restores
exactly those and leaves hand-hidden columns hidden. The key is lost if the
user clicks Save while grouped (the module recaptures `saved` wholesale); the
columns then stay hidden until shown, which is visible and one call to fix,
unlike silently un-hiding something the user meant to keep hidden.

`diagnose_grid` splits hidden columns into view-hidden and hand-hidden, because
the fixes are opposites — flatten the grid vs `set_column_layout { show }`.

### Where new blotters land on the dock

`create_blotter` files its launch entry as an item inside the dock
**DropdownButton labelled "Assets"**, creating that menu when the dock has
none — not as another top-level dock button. A dock that grows one button per
blotter stops being navigable after a handful, which is what the Dock Editor's
dropdowns exist to solve. `dockGroup` overrides the menu name; `dockGroup: ""`
opts back out to a top-level button.

That makes menus part of every dock operation in `registryOps.ts`, not just
`addDockButton`:

- **idempotency** spans menus — an entry already filed under a group must not
  also sprout a top-level button;
- **`addDockButton` also self-heals a duplicate that already exists** —
  collapsing every match for a `registryEntryId` down to the first one found
  before deciding whether to add. Two near-simultaneous self-heal calls (e.g.
  two windows booting at once, both racing `ensureAiAssistantDockButton`) can
  each read the dock before either's write lands and each append their own
  placement, since a placement's `id` is a fresh UUID per call — this is what
  produced two identical "AI Assistant" buttons on the dock. Every subsequent
  boot now converges back to one instead of leaving it duplicated forever;
- **`removeDockButtons` / `renameDockButtons`** recurse into menu options
  (including nested sub-menus), because a grouped blotter exists *only* as a
  menu item. Skipping them would leave an item that warns and no-ops on click.
  An emptied group is deliberately left in place — it may be the user's own
  menu, and deleting one blotter should not remove it.

The assistant's own dock button (`ensureDockButton.ts`) stays top-level: it is
a tool, not an asset.

### Template vs instance

A registry entry's `configId` addresses the component's **template** row
(`isTemplate: true`). Launching a blotter from the dock does **not** read that
row — [`openfin-platform/src/launch.ts`](../../../../packages/openfin/openfin-platform/src/launch.ts)
mints a per-window instance id and eagerly **clones** the
template into a fresh `isTemplate: false` row, after which the view reads only
its own row.

So a write to the template alone reaches singleton blotters (same row) and
windows opened *afterwards* — but never a non-singleton blotter that is already
open. Blotters the assistant creates are `singleton: true` (see
[Blotters the assistant creates are template-backed](#blotters-the-assistant-creates-are-template-backed)),
so the template IS the live row for them; multi-instance remains the case for
older blotters and any registered outside the assistant.

**The dock-launched assistant writes the template and nothing else.** It is a
component-definition editor, the same role Workspace Setup plays: it never edits
a running instance and does not enumerate them. There used to be a fan-out
across every discovered instance row; it was removed because it made one edit
behave differently depending on which windows happened to be open, and left a
component's template disagreeing with its own instances about what it is.

`resolveWriteTargets` ([`gridProfiles.ts`](../src/aiAssistant/gridProfiles.ts))
now returns exactly one of two things:

| Scope | How it is reached | Rows written |
|---|---|---|
| Component (default) | assistant opened from the dock | the template |
| This window only | assistant opened from a blotter's wand button, **or** a call names an `instanceId` | that row alone, never the template |

A wand-launched panel is pinned to the window it was opened from by
`dispatchTool` ([`useToolExecutor.ts`](../src/aiAssistant/useToolExecutor.ts)) —
see [Scope: blotter vs window](#scope-blotter-vs-window) below. An unpinned
call in that session reaches that window ALONE, never the template and never a
sibling window; `patchGridModule` runs its update callback against that row's
OWN previous state, so the window keeps its local customisations. This used to
also write the template ("Component + this window"), which is what let a
change made from one blotter window leak into every other instance of that
grid type — fixed by promoting the wand's focus from a fan-out hint to a hard
pin.

The consequence to be honest about: for an older multi-instance blotter, a
dock-launched change lands on the template and its already-open windows keep
what they were opened with until they are opened again — exactly what editing
that component in Workspace Setup does.

### Inferring columns for a live feed

A mock provider gets `columnDefinitions` for free (`withInferredColumns` in
`providerColumns.ts`, a hand-curated catalogue). STOMP and REST providers used
to save with none — the model had to tell the user to open the Data Provider
Editor and run "Probe → Fields" by hand. `infer_provider_fields`
(`providerFieldTools.ts`) closes that: it calls the same plain,
non-React functions the editor's "Probe → Fields" button does —
`probeStomp`/`probeRest`/`inferFields`, all pure exports of
`@wellsfargo-starui/data` with no dependency on the editor's own
`useProviderProbe.ts` hook — so the assistant can dial the live feed itself.

There's no hand-picked catalogue for an arbitrary feed the way mock has, so
curation is structural rather than a guess at domain meaning:
`suggestedColumns` (`providerColumns.ts`) puts shallow (top-level) fields
before nested ones and caps the result at 40 — "a blotter, not a schema dump",
the same reasoning `withInferredColumns` already uses for mock, applied
without pretending to know what a given feed's fields mean. `infer_provider_fields`
is read-only — it returns a field picker (same `FIELD_CELL` shape and
`chat/FieldPickerCell.tsx` rendering as `list_provider_fields`, `selected`
holding the suggested subset) and saves nothing; `set_provider_columns` applies
a set exactly like it already does for mock (`preset: "curated"`,
`preset: "all"`, `fields`, `add`/`remove`), re-probing the feed each time
since nothing about a probe's result is persisted beyond the columns actually
chosen. `websocket`/`socketio` feeds still have no probe transport — that gap
predates this and isn't something either tool builds.

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
| `focusInstanceId` | the window the request came **from** (the wand button) | the DEFAULT pin — `dispatchTool` uses it as `pinnedInstanceId` for any call that doesn't name its own instance |
| `pinnedInstanceId` | the window the request is **about** | a *boundary* — reads come from that row, writes go there alone |

The pin is set either explicitly by a call — `instanceId` alongside
`targetGridId`, or a `targetGridId` that *is* a window id (what a model does
straight after `list_grid_instances`) — or, when nothing more specific is
named, it defaults to `focusInstanceId`. That default is what makes an
ordinary, unpinned call in a wand-scoped conversation land on the window it was
opened from instead of the template: before this, `focusInstanceId` was only a
fan-out *hint* to `resolveWriteTargets` ("writes still fan out to every row;
this one is merely guaranteed included"), which is what let a change made from
one blotter window silently reach every other instance of that grid type. That
lower-level fan-out behavior still exists in `resolveWriteTargets` and is still
tested — it just isn't what a real tool call hits any more, since every call
goes through `dispatchTool`'s pin-by-default.

**A pinned write skips the template on purpose.** Including it would leak the
change into every window opened later — the opposite of "just this one". That is
a footgun if silent, so `describeFanOut` says it in the tool result, and the
system prompt's scope block tells the model this session is pinned so it
doesn't claim a change reached the whole blotter when it didn't.

**The header shows what a scoped session is pinned to.** The panel resolves
the window's own active layout (`readActiveProfile`, keyed by the instance —
never the template) and reports it, alongside the instance id, through
`onScopeResolved` — both `AiAssistantPanel`'s settings strip and the
`AiAssistant` page header render "this window" and the active layout name so
it's visible, not just inferred. It's a live readout, refreshed after every
tool call: the conversation does NOT pin to a layout snapshot, since a user can
switch layouts mid-conversation and `reload_grid`/`switch_profile` already
exist to reconcile drift — pinning to a stale layout would reintroduce the
"my change isn't showing up" confusion those were built to fix.

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
| `registryOps.ts` | Component Registry and dock CRUD — top-level buttons *and* dropdown menu items (`BLOTTER_DOCK_GROUP`) |
| `blotterTools.ts` | create / open / rename / delete a blotter, bind a provider |
| `profileTools.ts` | profile CRUD and switching |
| `providerTools.ts` | data-provider CRUD, `get_grid_columns`, `describe_data_fields` |
| `providerFieldTools.ts` | field pickers — `list_provider_fields`/`infer_provider_fields`/`set_provider_columns` |
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
| `dataQuery.ts` | the query language: filter, group, aggregate, sort, limit — and `pivotBy` for a cross-tab |
| `dataTools.ts` | `summarize_grid_data`, `query_grid_data`, the `DataCellPayload` |
| `chartSpec.ts` | picks the chart from the result's shape; owns the colour ramp |
| `chat/DataChart.tsx` | renders bar / hbar / line / area / pie / scatter |
| `chat/DataResultCell.tsx` | the notebook-style output cell — renders in the side panel, not inline |
| `chat/AnalysisTable.tsx` | the shared table renderer: sort, sticky pivot row-labels, heatmap mode |
| `chat/heatmap.ts` | per-column cell-shading colour math for heatmap mode |
| `chat/AnalysisPanel.tsx` | the side panel itself — entry tabs + the active result |
| `chat/AnalysisResultCard.tsx` | the compact reference a result leaves in the transcript |
| `chat/useThemeMode.ts` | reactive light/dark read, for heatmap's theme-specific alpha clamp |

### Support

| File | Role |
|---|---|
| `featureGuides.ts` | on-demand worked examples, lifted from `markets-grid-lab` seeds |
| `diagnostics.ts` | `diagnose_grid` — one walk of the whole chain |
| `undo.ts` / `useUndoStack.ts` | per-turn profile snapshots; `IRREVERSIBLE_TOOLS` |
| `providerColumns.ts` | field inference — `probeMock` for mock, `probeStomp`/`probeRest` + curation heuristic for live feeds |
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

`chart: "heatmap"` is on this same enum but is NOT a chart `buildChartSpec`
draws — it's a table-shading MODE (`AnalysisTable`'s `heatmap` prop). Two bugs
a naive implementation hits, both fixed at the source: `buildChartSpec` bails
to `undefined` for it explicitly (next to the existing `'none'` bail), because
`resolveKind`'s unconditional passthrough for an explicit request would
otherwise hand `DataChart` a `kind: 'heatmap'` its renderer has no branch for
and silently fall through to a bar chart; and `DataResultCell` checks
`payload.chart === 'heatmap'` BEFORE calling into the chart pipeline at all,
since the bail alone prevents a broken chart but doesn't turn shading ON —
that's a separate, explicit wire to `<AnalysisTable heatmap>`. Only
`query_grid_data`'s schema offers it — `summarize_grid_data`'s digest has no
2D table to shade, so its enum is `SUMMARY_CHART_KINDS` (`chartSpec.ts`), not
a bare spread of `CHART_KINDS`.

### The side panel

A data-cell result no longer renders inline in the transcript — it opens in a
resizable side panel next to the chat (`ResizablePanelGroup`, from
`@wellsfargo-starui/react`, wrapping `react-resizable-panels`). `ToolCallCard`'s
special case for a `data-cell` result renders a compact `AnalysisResultCard`
(gridName, what ran, row count, an "Open in panel" button) instead of the full
cell; `FieldPickerCell` (`field-cell`) is unaffected — a small interactive
picker, not a heavy analysis output, it stays inline.

No second state store: `AiAssistantPanel` derives the panel's entries from the
existing `transcript` via `useMemo` (every `tool` item whose
`activity.result.kind === 'data-cell'`), so a result already persists exactly
the way the rest of the conversation does. A local `activeAnalysisId` +
a ref-backed "follow the latest" flag pick which entry is showing — following
flips off only when the user clicks an OLDER entry, not the current newest one.

**Why `onOpenAnalysis` is a bare `() => void`, not `(id: string) => void`:**
`activity.id` (the tool call's own id) comes from the LLM backend's
`tool_calls` response — not guaranteed unique across turns for every
OpenAI-compatible server. `TranscriptItem.id` (from `useChatSession`'s
`nextId()`) is. So `ToolCallCard` is never given an id to report at all; only
`ChatTranscript`, which has the transcript item's own id in scope at its
`.map` call site, curries it in:
```tsx
<ToolCallCard activity={item.activity} onOpenAnalysis={onOpenAnalysis && (() => onOpenAnalysis(item.id))} />
```
This makes the bug impossible by construction rather than by convention —
worth knowing before "simplifying" the callback signature.

The panel auto-opens itself once, the first time a result lands in a given
mount (`analysisPanelRef.current?.expand()`), regardless of whatever the
persisted collapse preference currently says — a result behind a collapsed
panel with no visual cue defeats the point of asking. After that it never
forces the panel again; the user's own toggling (`aiAssistant.panelCollapsed`
in localStorage, via the existing string-only `useLocalStorageState`) decides
from then on. `react-resizable-panels` v4 has no `onCollapse`/`onExpand` props
— only `onResize`, which fires for every size change regardless of cause (the
toggle button, a handle drag past the collapsible threshold, or the auto-open
itself), so `Panel`'s own authoritative `isCollapsed()` is read inside that one
handler rather than a size-threshold heuristic.

A very wide pivot or a wide heatmapped table just means the panel's own
`AnalysisTable` scrolls — the transcript column is no longer what constrains
table width, which used to force awkward horizontal scrolling inside a narrow
chat bubble.

### Pivots

`dataQuery.ts`'s `DataQuery` gains `pivotBy?: string[]` alongside `groupBy` /
`aggregate` — `groupBy` is the row dimension, `pivotBy` the column dimension,
`aggregate` the measures filling the cells, the same three-role shape already
taught to the model for the LIVE GRID's own pivot mode
(`set_row_grouping`/`layoutTools.ts`) even though the implementation is
unrelated — this is the analysis-query engine, not AG-Grid's pivot mode.

`runPivot` (private to `dataQuery.ts`) cross-tabs into the SAME `QueryResult`
shape (`columns`, `rows`) plus optional `pivot: { rowDims, colDims, measures }`
metadata, so `AnalysisTable` knows how many leading columns to freeze
(`stickyLeadingCols`). Guardrails written for this feature, since the live
grid's own pivot validation has no equivalent to adapt:

- `pivotBy` requires both `groupBy` and `aggregate` — checked BEFORE the
  older, generic "aggregate needs groupBy" rule in `validateQuery`, so a
  `pivotBy`-with-no-`groupBy` call gets the more specific, actionable message;
- a column can't be in both `groupBy` and `pivotBy`;
- **distinct pivot-column count is capped at 30** (`MAX_PIVOT_COLUMNS`) —
  computed against the flattened output width (distinct pivot tuples ×
  aggregate count), not just the raw dimension cardinality, since two
  aggregates on 15 currencies is 30 columns even though "15 distinct values"
  sounds fine;
- **flattened column-name collisions are rejected**, not silently
  overwritten — two distinct pivot tuples CAN format to the same string (a
  pivot value containing the `" · "` join separator, combined with a custom
  `aggregate[].as`), and `dataQuery.test.ts`'s pivot suite constructs exactly
  that case rather than trusting string uniqueness by assumption.

An empty (row, column) combination is `null`, not a computed `0` — a pivot is
dense by construction (every combination gets a cell), so most fixed-income
cross-tabs have real gaps, and `0` in every one would read as a measured zero
rather than "no data here". `compact()` (`AnalysisTable.tsx`) already renders
`null` as `—`.

---

## 5. Toolbar entry point

The one `packages/` change. `PrimaryToolbar` takes an optional
`onOpenAssistant`, rendering a `Wand2` ghost button as the **last** child of
`ds-primary-actions-trailing`, threaded from `MarketsGrid` → `MarketsGridHost`.

It is deliberately *not* an `adminAction`: under
`toolbarActionsLayout: 'overflow'` those collapse into a menu, and the ask was a
button pinned to the toolbar's right edge. Omitted by consumers who don't pass
the prop, so nothing changes for other apps.

Clicking it opens `/#/ai-assistant?grid=<id>&instance=<instanceId>&scope=locked`
in its own window (`windowName: 'ai-assistant-' + gridId`, so two blotters get
two windows). In scoped mode the panel shows the blotter id, the window and its
active layout, hides the grid picker, and `applyGridScope` **enforces** the
blotter boundary in the executor — a model that ignores the prompt still cannot
reach another blotter. `dispatchTool` separately pins every call to the window
it was opened from by default (see [Scope: blotter vs
window](#scope-blotter-vs-window)), so a change made here reaches that window
alone, not the blotter's other windows or its template.

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
- **`websocket`/`socketio` feeds can't be probed.** `infer_provider_fields`
  covers stomp and rest; the other two provider types have no probe transport
  in `@wellsfargo-starui/data` at all yet — not a gap this feature opened, it
  already existed in the Data Provider Editor's own "Probe → Fields" button.

---

## Related

- [`README.md`](../README.md) — the app itself
- [`docs/APPS_REPO.md`](../../../../docs/APPS_REPO.md) — how `apps/` consumes the platform
- [`CLAUDE.md`](../../../../CLAUDE.md) — repo conventions (file naming, ceilings, UI stack rules)
- `apps/source/markets-grid-lab` — the reference app the feature guides were lifted from
