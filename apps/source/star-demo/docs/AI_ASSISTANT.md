# AI Assistant — LLM integration in `star-demo`

A chat assistant that configures MarketsGrid blotters and analyses their data by
calling tools, not by generating code. It lives entirely in
[`src/aiAssistant/`](../src/aiAssistant/) — one `packages/` change aside (the
toolbar wand button, see [Toolbar entry point](#toolbar-entry-point)).

- **49 source modules** + 37 test files under `src/aiAssistant/`
- **69 tools**
- App-wide suite: **859 tests across 73 files** (`npx vitest run` in `apps/source/star-demo`)

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

### One window, one instanceId — resolved in two places that must agree

A blotter window resolves its instanceId **twice**, and both answers have to be
the same row or the assistant writes somewhere the grid never reads:

| Who | How |
|---|---|
| the grid (`HostedMarketsGrid` → `useHostedIdentity`) | `fin.me.getOptions()` customData → `?instanceId=` → `defaultInstanceId` |
| the view (`BlottersMarketsGrid`) — live-sync subscription, `publishActiveProfile`, and the id the wand hands the assistant | `resolveBlotterInstanceId`: `?instanceId=` → `runtime.resolveIdentity()` → `defaultInstanceId` |

They used to disagree. `runtime.resolveIdentity()` reads
`fin.View.getCurrentSync()`, and an `asWindow: true` launch has no view to
return, so `getOptions()` rejected, customData came back empty, and the chain
fell through to the view's `identity.name` — the window name
`registered-<entryId>-<instanceId>`, which is a *different string* from the
instanceId. The grid meanwhile resolved the real id. The result was the exact
symptom this section opens with: a rename **persisted correctly**, the
subscription fired against a row nothing had touched, and the header never
changed on screen. `get_grid_columns` then read the row the assistant had
written and reported the new name, so the assistant insisted it had worked.

Two changes make them agree by construction, and both are pinned by tests:

- `resolveOpenFinIdentity` keeps the view name only **below** the URL param
  (`packages/openfin/host-openfin/src/identity.ts`). The launcher stamps the
  minted id into customData and the query string together
  (`appendLaunchIdentityParams`) precisely so it resolves without a view.
- `BlottersMarketsGrid` reads that same URL param first rather than deriving an
  id of its own.

### A window with no registry entry is still fully addressable

The window's own configId is enough on its own — it is the id every profile read
and write keys on, and `gridScopeId` returns the pinned instance ahead of
`entry.configId` anyway. A registry entry only ever added a display name and
template awareness, so requiring one meant a blotter whose row had lost its
identity (below) got a panel that could do *nothing*, rather than one that
merely lacked a name.

So when `resolveGridForInstance` and `resolveGridEntry` both come up empty but
the window supplied an `instanceId`, the panel scopes to that id, and
`resolveGridEntry` synthesizes a stand-in entry for it. Two properties keep that
safe, both pinned by tests:

- **It only ever stands in for the window this conversation is scoped to**
  (`currentPinnedInstance() ?? currentFocusInstance()`). Synthesizing for any
  unknown string would turn a model's typo into a silent write to a row nobody
  is looking at — an unrecognised id is still refused.
- **It never stamps an invented identity.** `identityFor` returns `undefined`
  for a synthetic entry, so `saveProfileSet` preserves whatever the row already
  carries. Writing the placeholder `componentType` / `componentSubType` would
  cause exactly the damage described next.

Such a write is also reported as `(this window only)`, never as a template edit
— the synthetic entry's configId equals the pinned window, which would otherwise
make every write look blotter-wide.

**A row's identity is load-bearing, and a write can destroy it.** Resolving an
instance back to its registry entry derives the template id from the row's
`componentType` / `componentSubType`. `saveProfileSet` used to fall straight
back to the generic `markets-grid-profile-set` / `''` shape whenever a caller
passed no identity — and `publishActiveProfile` (which only ever knows the
instanceId) does exactly that on every profile load. One such write left the row
undiscoverable for good. It now preserves the identity the row already carries,
taking the generic shape only for a genuinely new row.

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

### Desk context and limits — answers framed against the book

Every conversation started cold. The assistant knew the shape of the data but
nothing about the person reading it, so it could report "IG Credit is 4.2% of
the book" without knowing that 4.2% is 20bp through a cap. Arithmetically right,
professionally useless.

Two halves, deliberately different in kind:

- **Context** (`set_desk_context`) is free text — mandate, benchmark. Stored
  once and injected into the system prompt, so it changes the character of every
  later answer with no tool call. The prompt block says explicitly that this is
  the user's description of their book, treated as background rather than as an
  instruction to act on.
- **Limits** (`add_limit`, `list_limits`, `remove_limit`, `check_limits`) are
  structured, because a limit has to be *checked*, not described. Each is
  evaluated by `runQuery` over real rows — the same engine every other number
  goes through — so a breach is a computed fact, never the model's estimate.

A limit is `aggregate(metric)`, optionally per `groupBy`, against a `max`/`min`,
in either absolute terms or `percentOfTotal`. `groupBy: "issuer"` with
`unit: "percentOfTotal", max: 5` is a 5% single-issuer cap.

Four rules keep the output honest, all pinned by tests:

- **An unevaluatable limit is never reported as passing.** A bad column, an
  unreadable blotter or a zero denominator lands in `unevaluated` and the
  summary labels it "treat as unknown, not as passing" — the worst failure this
  feature could have is silent false comfort.
- **`percentOfTotal` requires `sum`.** A share is a sum over a sum; any other
  aggregate makes the ratio meaningless, so it is refused at write time.
- **An ungrouped limit is about the book as a whole**, so per-blotter rows are
  summed back into one number rather than each book being tested separately.
- **Breaches are ranked by how far through they are**, because the point of the
  answer is what to look at first.

**These are advisory.** Nothing here blocks a trade or edits data — it is a
desk's own note of its rules, and a breach is a finding to show someone. The
tool description says so, so the model does not present it as a compliance
control.

### "Why did it move?" — attribution

`explain_change` is the natural follow-up to a comparison and the question a PM
actually asks. It decomposes the change in ONE metric since a baseline into who
caused it: each row's delta is bucketed by a dimension (sector, issuer, desk),
summed, and ranked by contribution with its share of the net move.

It is a calculation, not a judgement — the model narrates the table and never
estimates attribution itself.

Two details that keep the parts adding up to the whole:

- **Rows that appeared or disappeared are part of the decomposition.** A
  position closing is one of the commonest reasons a total moved; dropping it
  would leave the contributions failing to reconcile to the total.
- **A disappeared row can only be attributed if the baseline captured the
  grouping column.** When it didn't, those rows are bucketed under
  `(rows that disappeared)` and the summary says so, rather than being silently
  dropped or guessed at.

Shares can exceed 100%: when contributions offset, one group's `+30` against a
net `+20` is genuinely 150% of the move. That is real and worth seeing, so it is
not clamped.

### A dashboard is verified before anyone sees it

A dashboard used to be composed hopefully: the model picked blocks, the window
opened, and whichever ones could not draw said "nothing chartable" on screen.
The user then went back to the chat to find out why, block by block. All of
that is avoidable — the queries are pure and the rows are already there, so the
answer is knowable at compose time.

`preflightReport` (`reportPreflight.ts`) executes every block against real rows
and classifies it:

| | Meaning | What happens |
|---|---|---|
| **broken** | can never draw — a column that does not exist, no numeric to plot, a chart kind the shape cannot satisfy, a KPI tile whose value is absent from its own result | creation is **refused**, naming each block by index and reason |
| **empty** | the query is valid and matched nothing right now | created, and the fact is reported |
| **ok** | it draws | — |

Refusing the first and allowing the second is what makes this deterministic:
a dashboard that gets created renders, and one that would not is rejected with
the specific reason instead of shipped to be discovered. Both
`create_live_report` and `save_dashboard` run it — a saved dashboard is worse
to get wrong, since it goes on the dock and is opened again tomorrow.

A preflight that cannot RUN (no provider bound, feed unreachable) never blocks
the report: that is the window's own "no data yet" case, and refusing there
would be worse than showing it.

Rows are fetched once and shared across all sixteen blocks, not once per block.

`whyNotChartable` supplies the same reasons to the canvas, so a block that does
slip through says "No numeric column to plot — this result has desk, sector"
rather than "Nothing chartable in this result".

### Saved dashboards — Assets → Dashboards → <name>

`create_live_report` opens a window from a handoff written to `localStorage`
with a **ten-minute TTL**. That is right for "show me this now" and useless for
"keep this": close the window and the dashboard is gone with no link back.

`save_dashboard` makes it three ordinary things the platform already does:

1. the `ReportSpec` **and the blotter it reads** persisted as its own config
   row (`dashboard-spec::<id>`). Both, because a dashboard opened from the dock
   arrives with no blotter in context — saving the spec alone left the window
   unable to resolve which grid to read, so it fetched no rows and rendered
   empty. `targetGridId` is therefore required by `save_dashboard`, and checked
   against the registry rather than taken on trust,
2. a Component Registry entry whose `hostUrl` carries `?dashboard=<id>`, so the
   existing launcher opens it like any other component — no new launch path,
3. a dock button under **Assets → Dashboards → \<name\>**.

Nothing here is a new mechanism, which is the point: a dashboard becomes a
component, and everything that already works for components works for it.
`delete_dashboard` removes all three — leaving any one behind gives a menu
entry that opens an empty window.

The nesting uses `DockMenuItemConfig.options`, which has always supported it: a
sub-menu is a menu ITEM carrying options instead of an action. Blotters stay
flat under Assets; dashboards go one level deeper, because a dock that grows a
top-level entry per dashboard stops being navigable.

### Rearranging a dashboard

Blocks can be dragged between and within regions and resized by their bottom
edge. Rearranging works on **any** report, saved or not — seeing the layout you
want is most of the value, and a report with no handles reads as a missing
feature rather than a deliberate limit. Only SAVING needs somewhere to write
to: an ephemeral report's save control is disabled and says why ("Keep this as
a dashboard to save its layout") rather than silently doing nothing. Undo still
works there, because the rearranging was real.

`ReportCanvas` grows the affordances when given `onSaveLayout` **or**
`saveDisabledReason`; with neither, it renders exactly as it always did.

The affordances are deliberately quiet. Nothing shows until the pointer is
over a block, and what appears then is a grip and a hairline — not a toolbar,
which would be present all the time to say nothing most of the time. A
dashboard is read far more often than it is rearranged.

Four rules, in `useLayoutEditing`:

- **Dragging is on the HANDLE, not the block.** A card that moves when you try
  to select text in it is worse than one that cannot move.
- **A layout change is a PROPOSAL.** The draft is never written on its own —
  dragging a card by accident must not silently rewrite a dashboard other
  people open. Save and undo appear only once something has moved.
- **Dirty compares layout only** (kind, region, height, title). A live
  dashboard's data changes constantly; "unsaved" must mean someone moved
  something, not that a number ticked.
- **Heights are clamped 120–900px**, on write and again on read. Below the
  floor a block shows nothing; above the ceiling it pushes the rest of the
  dashboard out of view.

Saving writes only `blocks` back to the dashboard's config row — moving a card
is not a licence to rewrite the report's title, cadence or queries. Native
HTML5 drag and pointer events rather than a drag-and-drop dependency: pointer
capture is also what keeps a resize working once the cursor leaves the 6px
strip, which it does immediately.

### Blocks size themselves

- **Tables bound their height and scroll inside the block** (`maxHeight`,
  default 320px, clamped 120–900). A hundred-row result used to grow to its
  row count, push everything below it off the page and stretch its whole
  region — taking the charts beside it with it.
- **Side rails are sized by what they hold.** A fixed 220–300px is right for
  commentary and stacked stats and far too narrow for a table, which then
  showed its first column and clipped the rest; a rail holding a table gets
  320–420px.
- **KPI figures compact rather than truncate.** A headline number set at
  19–26px in a fraction of a rail rendered `12,547,64…` — an ellipsis where the
  answer should be. Anything long enough to clip becomes `12.55M`, with the
  exact value on the element's title.

### The analysis window is pushed, not polled

`open_analysis_window` and `create_live_report` open a standalone window that
draws a `ReportSpec`. It used to be a **poll**: `setInterval` → `fetchGridRows`
→ re-run every block. Three problems with that:

- `fetchGridRows` subscribes to the provider, awaits a full snapshot and
  unsubscribes — that whole cycle every `refreshMs`.
- Every tick re-ran EVERY block's query over every row. A 16-block report (the
  cap) did sixteen full-row queries per tick.
- `refreshMs` is optional, so the default was **not live at all** — the window
  loaded once and never updated. "Live report" meant "re-queried on a timer",
  and only if the model remembered to ask for one.

It now subscribes to the blotter's provider through the same `LiveRowSource`
the summary panel uses: one array, mutated in place, change reported by a
version counter. `refreshMs` becomes unnecessary and is ignored whenever a live
source is available; the polling path survives only for a blotter with no bound
live provider, which still renders (`fetchGridRows` allows sample rows).

Two details:

- **`ReportCanvas` memoises every block on `rowsVersion`, not on `rows`.** A
  live array is stable by reference, so an identity-keyed memo would never
  invalidate and the report would freeze at its first render. A test pins this
  by counting real calls into the query engine.
- **Every block is live; commentary is not.** `kpis`, `lanes`, `chart`, `table`
  and `pivot` all read the memoised per-block result, so they update together
  on each version bump. `commentary` is authored prose and is deliberately
  skipped by the query pass — it is the one block that does not move.
- **The "ran at" stamp moves with the data.** Left at the value the initial
  fetch set, a pushed dashboard showed the time the WINDOW opened beside
  numbers from an hour later; a stale timestamp next to live figures is worse
  than none. A model-supplied `asOf` is pegged to a moment on purpose and is
  never overwritten.
- **The badge says how the numbers actually arrive** — `live · streaming` when
  pushed, `live · every Ns` only when genuinely polling, nothing when static.
  It used to key off `spec.refreshMs`, which stopped meaning anything once the
  window subscribed: a genuinely live report showed no indicator at all.
- **A backgrounded window does no work.** It is its own OpenFin window, so
  `document.visibilityState` is the whole story: minimised or behind another
  window means nobody is reading it, and it syncs to the current version the
  moment it comes back.

### The brief, and "what if" — composition over new machinery

Two tools compute nothing of their own; both are compositions, which is the
point rather than a shortcut.

**`morning_brief`** answers "what do I need to know?" in one call: what is on
each book, what has moved since its baseline, which limits are breaching. Each
part already refuses honestly when it cannot answer, and those refusals are
carried through verbatim rather than flattened into a cheerful summary — an
unreadable blotter is named, and a blotter with no baseline is reported as
having no mark rather than as having not moved.

**`simulate_change`** is the pre-trade question: add 50mm of ACME, mark a sector
down 10%, and see which limits would break. It builds an adjusted COPY in
memory and never touches the grid, the feed or a config row.

Two things make it trustworthy:

- **The "before" and "after" go through one code path.** `evaluateLimits` takes
  its rows from an injected source (`LimitRowSource`), so the real and
  hypothetical numbers are computed identically by construction rather than by
  two implementations that would have to be kept in agreement.
- **Nothing is written, and the summary leads with saying so.** A model that
  concluded it had staged a trade would be dangerous in a way none of the other
  tools are, so the disclaimer is the first sentence, not a footnote.

### Portfolio-level questions — `query_across_blotters`

Every other data tool takes a single `targetGridId`, which is right for a trader
on one book and wrong for whoever owns several. "What's my total exposure?",
"which desk carries the risk?" could not be asked at all — the model's only
option was to query each blotter in turn and add the numbers up in prose, which
is exactly the arithmetic this codebase keeps out of the model.

`runQuery` is pure and total, so the composition is easy: fetch each blotter,
tag every row with a `blotter` column naming where it came from, union, and run
one query. `groupBy: ["blotter"]` then breaks any total down by book. The
argument shape is `query_grid_data`'s, minus `targetGridId`, so the model writes
one kind of query and only changes which tool it calls.

The care is all in being honest about the union:

- **A blotter that cannot be read is named and EXCLUDED**, in the summary the
  model reads as well as in the payload's provenance. A total that silently
  omits a whole book still looks like a total.
- **A name that means different columns on different blotters is refused.**
  "Market Value" being `marketValue` on one and `mv` on another is the trap:
  summing them into one number is wrong in a way that looks right, so it fails
  with both candidates named rather than taking whichever came first.

### "What's changed since…" — baselines

`query_grid_data` and `summarize_grid_data` both see exactly one snapshot: the
rows on screen now. Nothing remembered what they looked like earlier, so the
question a desk asks all day had no source to read.

Three plausible-looking sources do NOT work, recorded so they aren't retried:

- **`data-change-history`** is settings for an *undo journal of user edits*
  (`stream: false` by default). It is not a market-data log, and the journal is
  in-memory, never persisted.
- **`alerts` history** is explicitly never persisted (`serialize` writes
  `history: []`) and lives in the grid's window, not the assistant's.
- **The grid's `historical` provider mode** is real, but `fetchGridRows` takes a
  live snapshot with no as-of parameter, and whether a given feed can serve a
  prior date is provider-specific.

So `capture_baseline` marks a snapshot explicitly and stores it as its own
config row (`baseline::<instanceId>::<name>`, componentType
`markets-grid-baseline` so it never shows up in blotter-instance discovery).
`compare_to_baseline` diffs the live rows against it and returns a ranked table
of movers — absolute and percent deltas, plus rows that appeared or dropped out.
`list_baselines` says what marks exist.

This is deliberately honest about what it is: **a mark the user set**, not a
claim about market history. It works on any provider, mock included, with no
feed support at all.

Three properties worth knowing:

- **A `keyColumn` is required.** Without a stable row identity there is no way
  to distinguish "this row moved" from "one left and another arrived" — row
  order is not stable on a live feed — so it refuses rather than matching by
  position.
- **Only captured columns can be compared.** Comparing one the baseline never
  held is refused by name, not silently skipped.
- **Baselines are capped at 5000 rows** and the cap is reported, in the capture
  summary and again on every comparison — because rows beyond it would
  otherwise read as "added" and quietly overstate what happened.

### Alerts — the assistant watching a book nobody is looking at

`create_alert` (`alertTools.ts`) is the one tool that outlives the conversation.
A rule keeps evaluating on every tick after the window is closed and reaches the
user through toast, the toolbar bell and — under OpenFin — the Notification
Center, via bridges the alerts module already ships.

It takes the trigger the way a person states it and compiles it:

| The user says | Arguments | Compiled trigger |
|---|---|---|
| "tell me if spread goes above 50" | `column`, `operator`, `value` | `dataChange` + `expression: "value > 50"` |
| "alert me on a 5% drop" | `column`, `movesBy`, `mode`, `direction` | `relativeChange` |
| "tell me when a new axe appears" | `rowEvent` | `rowChange` |
| anything else | `expression` | `dataChange`, passed through |

**Why it is a dedicated tool rather than `add_module_item`.** Two reasons, and
the second is the real one. A model asked to "let me know if…" does not reach
for a tool called *add module item* — the same argument that put `rename_column`
next to `set_column_style`. And the shape it would have copied was wrong: this
guide documented a `dataChange` trigger as `{ operator, value }`, but the type
is `{ expression, column? }` and `evaluateDataChangeRule` calls
`parseAndEvaluate(trigger.expression, …)` inside a `try`. An `operator`/`value`
rule leaves `expression` undefined, the parse throws, the evaluator swallows it,
and the alert **saves cleanly, lists normally and never fires** — with nothing
anywhere to say so. The guide is corrected and a test now runs a compiled
expression through the real engine, so a rule that cannot fire fails the suite.

Defaults lean toward being heard and not being a firehose: all three channels
(`openfin` is a no-op outside OpenFin, so it costs nothing to leave on) and a
5s debounce rather than the module's 1s, because a threshold stays true for as
long as the price does and would otherwise re-fire on every tick.

### A new blotter opens laid out, not as a schema dump

`create_blotter` seeds a fixed-income layout into the template's profile
(`blotterBlueprint.ts`). Without it a blotter opened in whatever order the feed
listed its fields, every number left-aligned at whatever precision arrived,
dates in the browser locale, nothing pinned.

Each column is classified by name into a **role** (identifier, price, yield,
spreadBps, duration, quantity, money, pnl, date, …) and a **section**; sections
order the columns and become nested header bands. The conventions are not
preferences — two of them make a screen wrong rather than merely plain:

| | Convention | Why |
|---|---|---|
| Numerics | **right-aligned**, tabular figures | puts units/tens/hundreds in one screen column, so magnitude reads by eye |
| Identity | **frozen left** (max 3) | 40+ columns is normal; scroll right and the row loses its identity |
| Dates | **`dd-mmm-yy`**, never numeric | `04/05/26` is two different days depending on the reader — and bonds settle on specific days |
| Spreads | **basis points**, 1dp | `0.0142` is unreadable to someone whose day is expressed in bp |
| Yields / coupons | percent, 3dp | |
| Prices | 3dp per 100 par | 2dp loses information a trader uses on size (tick formats exist for 32nds) |
| Quantities | thousands separators, 0dp | `25000000` vs `25,000,000` |
| P&L | green/red by sign | the first question is which way, not how much |
| MBS factor | 8dp | |

Ordering traps the patterns handle explicitly, each with a test:
`spreadDuration` is a **duration**, not a spread; `priceChangePct` a
**percent**, not a price; `issuerSector` and `securityType` are **categories**,
not names; and `tradeId` is an **identifier** while `bid` is a price — which is
why the id pattern requires a camelCase boundary rather than matching `id$`.

Alignment is written to **both** theme slots, because it does not vary by theme
and writing one means a theme flip drops it.

It is a starting layout, not a house style: everything is an ordinary
`column-customization` / `column-groups` assignment, so the user can change any
of it afterwards and nothing re-asserts itself. A provider that cannot be read
is not fatal — the blotter is created without a layout rather than not at all.

**Two guarantees, not arguments.** Every blotter the assistant creates is a
TEMPLATE component (`isTemplate: true`, `singleton: true`) and ALWAYS opens as
its own standalone workspace window. `asWindow` was removed from the tool
schema rather than left as an option a model could talk itself out of — a
docked view also has no stable window name, which is what
`reloadOpenComponents` matches on, so a provider change could never reach it.

### Nested JSON feeds

A feed whose rows are nested — `{ tradeId, issuer: { name, sector }, risk: { pv01 } }`
— becomes columns addressed by the **dotted leaf path**: `issuer.name`,
`risk.pv01`. That one id is used everywhere: the provider's
`columnDefinitions.field`, the catalogue `readColumnCatalogue` builds, the
`assignments` key a rename writes, and AG-Grid's own `field` (which resolves
dots natively). Containers are not columns — `leafFields` walks past them.

Three things make that work end to end, each pinned by tests:

- **Naming.** A nested field is labelled by its whole path (`issuer.name` →
  "Issuer Name"). The leaf alone made `issuer.name` and `counterparty.name`
  both read "Name", and `resolveColumn` refuses an ambiguous label — so
  "rename Name" matched two columns and was rejected, leaving the dotted id as
  the only way in. Flat fields are unaffected.
- **Resolution.** `normalizeKey` strips the dot, so "issuer name", "Issuer
  Name" and `issuer.name` all land on the same column, and nothing splits a
  colId on `.`. A nested `issuer.name` and a flat `issuerName` do collide by
  name; that is refused rather than guessed, and the exact colId still works.
- **Reading values.** `runQuery` and `summariseRows` resolve every column
  through `getValueByPath` (the same helper the expression engine, alerts and
  conditional styling already use). They used to do flat `row[colId]` access,
  which is `undefined` on a nested row: filters matched nothing, groups all
  collapsed into `(blank)`, and aggregates saw no numbers — with no error to
  explain any of it. `summarize_grid_data` also discovers nested leaves when
  the caller names no columns, instead of reporting one opaque `issuer` column.

### Authoring `columnDefinitions` directly

`set_provider_columns` covers *choosing* among fields the model already knows
about (a mock catalogue, or a live probe). It doesn't cover a custom header, a
pixel width, a hidden-by-default column, or a formatter — for that the model
authors `ColumnDefinition[]` itself and passes it as `config.columnDefinitions`
to `create_data_provider` / `update_data_provider`. Nothing new had to be built
for this to work — `createDataProvider`/`updateDataProvider`
(`providerTools.ts`) already merge and save whatever `config` object they're
given, `columnDefinitions` included, and `validateProviderConfig`
(`@wellsfargo-starui/types`) doesn't inspect it at all — the gap was that the
model was never told the shape (`toolSchemas.ts`'s `config` property used to
just say `"Provider-type-specific config object"`) or the one rule that
actually matters: **`field` has to be a real key the feed's rows carry.**
`snapshotChunkSize`'s "prune to `columnDefinitions[].field` + `keyColumn`"
behavior (`dataProvider.ts`) means an invented field name doesn't error — the
worker prunes it away before it ever reaches the hub, so the column just
renders empty forever. There's no code check for this (the schema comment
tells the model where to source real names: `infer_provider_fields`, a saved
catalogue, or the user).

**Fixed alongside this:** `updateDataProvider` saved a `columnDefinitions`
edit correctly but never reloaded a blotter already bound to the provider —
unlike `set_provider_columns`, which always has. Since a provider's columns
are only read when a grid's container mounts, this made a column edit look
like it silently failed on anything already open. `updateDataProvider` now
takes `configManager` and calls the same `reloadBlottersUsingProvider` +
`describeReload` tail `set_provider_columns` uses, gated on `a.config` being
present — a plain rename/description edit still skips the walk, since
nothing a mounted grid reads changed.

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
| `moduleCollections.ts` | the 18 customizer modules and their 11 addressable collections |
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

The pure statistics/query/chart-picking/heatmap-shading functions
(`dataDigest.ts`, `dataQuery.ts`, `chartSpec.ts`, `chat/heatmap.ts` in an
earlier version of this app) moved to `@wellsfargo-starui/data`'s `analytics`
barrel, and the two rendering pieces (`chat/DataChart.tsx`,
`chat/AnalysisTable.tsx`) moved into `@wellsfargo-starui/grid`'s
`summary-panel` customizer module (`packages/react-grid/grid/src/customizer/modules/summary-panel/`) —
both are now shared with the grid package's own summary-panel widgets instead
of living only here. This app imports them back from
`@wellsfargo-starui/data` and `@wellsfargo-starui/grid/customizer`
respectively; nothing about `dataTools.ts`'s tool surface changed.

| File | Role |
|---|---|
| `dataAccess.ts` | gets real rows from the SharedWorker hub; **carries provenance** |
| `dataTools.ts` | `summarize_grid_data`, `query_grid_data`, the `DataCellPayload` — imports `summariseRows`/`runQuery`/chart-kind constants from `@wellsfargo-starui/data` |
| `chat/DataResultCell.tsx` | the notebook-style output cell — renders in the side panel, not inline; imports `DataChart`/`AnalysisTable`/`compact` from `@wellsfargo-starui/grid/customizer` |
| `chat/AnalysisPanel.tsx` | the side panel itself — entry tabs + the active result |
| `chat/AnalysisResultCard.tsx` | the compact reference a result leaves in the transcript |

### Support

| File | Role |
|---|---|
| `featureGuides.ts` | on-demand worked examples, lifted from `markets-grid-lab` seeds |
| `columnImportGuides.ts` / `summaryPanelGuide.ts` | guides split out of `featureGuides.ts` to stay under its 800-line ceiling |
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

The pure computation this section describes (`summariseRows`/`buildHighlights`,
`runQuery`/`buildQueryHighlights`, `buildChartSpec`, heatmap shading) now lives
in `@wellsfargo-starui/data`'s `analytics` barrel, not as files under this
folder — moved there so `@wellsfargo-starui/grid`'s `summary-panel` customizer
module (§3's `## 3. Module map`) could reuse the same implementation instead of
duplicating it. Everything below still describes the CURRENT behavior; only the
file location changed. `DataChart.tsx` and `AnalysisTable.tsx` moved the same
way, into that module's own folder, and are imported back here from
`@wellsfargo-starui/grid/customizer`.

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

### Insight is computed, not just asked for in the prompt

`summarize_grid_data` has always had this: `DataDigest.highlights`
(`buildHighlights()` in `dataDigest.ts`) computes plain-sentence observations —
concentration, range, dominant category, sparse columns — rendered as a
bulleted list in `DataResultCell.tsx`, right above the stat cards/chart/table.
`query_grid_data` (a chart, a pivot, a heatmapped table) had no equivalent:
`QueryResult` carried only the rolled-up table, so a chart or pivot's only
interpretation was whatever the model chose to write in its own chat text —
not attached to the result, and not guaranteed.

`buildQueryHighlights()` (`dataQuery.ts`) closes that gap the same way, called
from both of `runQuery`'s return paths:

- **pivoted** — the single largest-magnitude cell across every non-row-label
  column, and its share of the sum of all cell magnitudes;
- **grouped, non-pivoted** — the leading group on the first (or default
  `count`) aggregate, and its share of the total across the visible groups.

Both are gated on `!result.truncated` — once some groups or cells are hidden
past the row limit, a "% of total" claim would be dishonest, so the highlight
is skipped rather than computed against a partial total. Not computed for a
raw/ungrouped query (e.g. a scatter chart's two-numeric-column result) — there
is no group or cell to call a leader. `QueryResult.highlights` lands in the
exact same `DataCellPayload` slot `DataDigest.highlights` already uses —
`DataResultCell.tsx` reads `digest?.highlights ?? table?.highlights ?? []`
once and renders whichever is present, so no new UI was needed.

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
