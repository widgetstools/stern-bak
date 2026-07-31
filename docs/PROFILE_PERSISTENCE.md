# Profile persistence — MarketsGrid

How the "which profile is active, and where do its bytes live?" question
is answered, in both the standalone browser and the OpenFin workspace.

This document is the canonical reference for anyone debugging "my last
profile didn't come back" or wiring a new host. Source-of-truth files
are linked inline; if you change one of them, update the relevant
section here in the same PR.

---

## 1. Concepts

### Profile

A **profile** is one bundle of per-grid user state (column customisation
formatters, conditional-styling rules, calculated columns, column
groups, saved filters, grid options, toolbar visibility, AG-Grid grid
state). On disk it is a `ProfileSnapshot`:

```ts
interface ProfileSnapshot {
  id: string;
  gridId: string;
  name: string;
  state: Record<string, SerializedState>; // one slot per module
  createdAt: number;
  updatedAt: number;
}
```

A grid has **one or more** profiles. Switching profiles swaps the
entire `state` bundle into the live platform store. Grid-level
provider selection is **not** part of a profile — it lives in
`gridLevelData` so a user can pin a provider once and try several
profiles against it.

Source: [`packages/shared/engine/src/persistence/StorageAdapter.ts`](../packages/shared/engine/src/persistence/StorageAdapter.ts),
[`packages/shared/engine/src/profiles/types.ts`](../packages/shared/engine/src/profiles/types.ts).

### Portable export (profile selector ⬇/⬆ buttons)

`ProfileManager.export()` / `.import()` produce and accept an
`ExportedProfilePayload`. Although `gridLevelData` is **not** part of a
profile in storage, the portable file bundles it as a `schemaVersion: 2`
sibling of `profile` so a single export is a complete grid-view
snapshot — profile state **plus** the provider selection / caption /
event bindings that were active. Import always re-applies that blob:
it is written to the same backing row via the adapter's
`saveGridLevelData` and a `gridLevelData:imported` platform event lets
the live container update the picker/caption without a reload.

`schemaVersion: 1` files (profile state only, exported before this
change, or from a grid whose adapter has no grid-level data) still
import — they simply leave the grid's existing `gridLevelData` alone.

Source: [`packages/shared/engine/src/profiles/types.ts`](../packages/shared/engine/src/profiles/types.ts)
(`ExportedProfilePayload`),
[`ProfileManager.export()` / `.import()`](../packages/shared/engine/src/profiles/ProfileManager.ts).
Config-table import/export (whole `appConfig` rows, including the bundled
`gridLevelData`) is a separate, row-level path — see the Config Browser
and `importConfigBundle`.

### Reserved Default profile

There is always exactly one profile with id `__default__` (the
`RESERVED_DEFAULT_PROFILE_ID` sentinel). `boot()` auto-creates it if
the storage doesn't have one. It cannot be renamed or deleted (those
operations throw / no-op respectively). It is the safe fallback target
whenever any other profile cannot be resolved.

### Active profile pointer

The "which profile is currently loaded?" pointer. Stored in up to two
layers:

1. **`activeIdSource`** (optional) — a host-injected override read at
   boot and written through on every commit. The OpenFin host wires
   one that reads/writes `view.customData.activeProfileId`.
2. **`localStorage`** — a per-`gridId` key
   `gc-active-profile:<gridId>`. The default fallback used when no
   source is configured or when the source returns `null`.

Source: [`packages/shared/engine/src/profiles/ProfileManager.ts:18-40`](../packages/shared/engine/src/profiles/ProfileManager.ts#L18-L40)
(`ActiveIdSource` interface and its JSDoc).

---

## 2. Storage adapters

`ProfileManager` doesn't know about IndexedDB, browser storage, or
OpenFin. It talks to a `StorageAdapter`. Three implementations ship:

| Adapter | Where it stores | Use case |
|---|---|---|
| `MemoryAdapter` | A `Map` in memory | Tests; ephemeral demos. No durability across reloads. |
| `LocalStorageBundleAdapter` | One `localStorage` key (`gc-bundle:<gridId>`) holding all profiles + active id | Small demos that need durability but no server. |
| `createConfigServiceStorage(...)` (in `@wellsfargo-starui/host-config`) | Dexie via `ConfigManager`, scoped by `(appId, userId, instanceId)` | Production. Survives reloads, isolates users, supports cross-tab broadcast. |

The adapter is built by a `ProfileStorageFactory` and passed via
`<MarketsGrid storage={factory} appId={...} userId={...} />`. The
factory is called once per grid mount with `{ instanceId, appId,
userId, gridId }` so adapter scope follows the props naturally.

`HostedMarketsGrid` (in `@wellsfargo-starui/widgets-react/hosted`) builds the
ConfigService factory automatically when you pass `withStorage` and
resolves `appId`/`userId`/`instanceId` from OpenFin view `customData`
(or props in browser mode). See
[`packages/react-core/widgets-react/src/hosted/README.md`](../packages/react-core/widgets-react/src/hosted/README.md#persistence-model)
for the wrapper's wiring.

---

## 3. The boot sequence

Source: [`ProfileManager.boot()`](../packages/shared/engine/src/profiles/ProfileManager.ts#L161).

```
1. Load Default row.
   - Adapter returns existing row OR null.
   - If null, write a fresh empty Default to storage.
   - Default snapshot is held as fallback for steps 2–4.

2. Build candidate id list.
   - Read sourceId  = activeIdSource.read()      (e.g. customData.activeProfileId)
   - Read lsId      = localStorage[gc-active-profile:<gridId>]
   - candidates = []
     if sourceId != null && sourceId != Default  → push sourceId
     if lsId != null && lsId != Default && lsId != sourceId → push lsId

3. Walk candidates in order.
   For each candidate id:
     row = adapter.loadProfile(gridId, id)
     if row != null:
       resolvedId = id
       snapshot   = row
       break
   If no candidate resolves: resolvedId = Default, snapshot = Default row.

4. Hydrate the live platform store.
   platform.resetAll()
   platform.deserializeAll(snapshot.state)

5. Commit the resolved id.
   updateState({ activeId: resolvedId, isDirty: false })
   writeActiveId(gridId, resolvedId)             → localStorage
   await writeSourceId(resolvedId)               → activeIdSource (e.g. customData)
   emit 'profile:loaded'

6. Refresh the profile list, wire dirty-tracking, subscribe to cross-tab changes.
```

**Why the priority is source → localStorage → Default**: OpenFin
duplicated views must each remember their own selection independently
(per-view customData), and that intent must survive a workspace
save/restore round-trip. localStorage is a per-browser fallback for
non-OpenFin hosts and a recovery path when customData is empty.

---

## 4. The OpenFin per-view source

Source: [`packages/react-grid/grid/src/widget/openfinViewProfile.ts`](../packages/react-grid/grid/src/widget/openfinViewProfile.ts).

```ts
export function createOpenFinViewProfileSource(): ActiveIdSource | null {
  const finGlobal = (globalThis as any).fin;
  if (!finGlobal?.me?.getOptions || !finGlobal?.me?.updateOptions) return null;
  return {
    async read() {
      const opts = await finGlobal.me.getOptions();
      const id = opts?.customData?.activeProfileId;
      return typeof id === 'string' && id ? id : null;
    },
    async write(id) {
      const opts = await finGlobal.me.getOptions();
      const current = opts?.customData ?? {};
      if (current.activeProfileId === id) return;
      await finGlobal.me.updateOptions({
        customData: { ...current, activeProfileId: id },
      });
    },
  };
}
```

Behaviour:

- **Returns `null` outside OpenFin.** Browser, Electron, jsdom tests
  all silently fall through to localStorage.
- **`read()` returns `null`** when `customData.activeProfileId` is
  missing or empty — boot then falls through to localStorage, then
  Default.
- **`write()`** preserves any other `customData` keys via the
  `{ ...current, activeProfileId: id }` spread. Skips the write
  entirely when the value is already set.
- **Errors are swallowed** to `null` / no-op. The source is
  best-effort — a broken OpenFin runtime must never prevent boot
  from completing.

This source is created once per grid mount by
[`useMarketsGridController`](../packages/react-grid/grid/src/widget/useMarketsGridController.ts)
and passed into `useProfileManager({ activeIdSource: ... })`.

---

## 5. The workspace save/restore round-trip

OpenFin's *Save Workspace* needs to capture per-view state. Two
mechanisms cooperate to make the active-profile pointer round-trip:

### Mechanism A — `useWorkspaceSaveEvent` flush

`HostedMarketsGrid` registers an awaited `workspace-saving` handler on
the `marketsui-workspace-save-channel` OpenFin Channel. On the save
trigger, the platform-side provider dispatches to every connected view
and **awaits** each handler's promise before capturing the snapshot.

The handler runs the same code path as the toolbar **Save** button —
`handle.saveAll()` → `MarketsGridHandle.profiles.saveActiveProfile()`
— so all unsaved edits land on disk before the snapshot is taken.

Source:
[`packages/react-core/widgets-react/src/hosted/useWorkspaceSaveEvent.ts`](../packages/react-core/widgets-react/src/hosted/useWorkspaceSaveEvent.ts),
[`packages/react-core/widgets-react/src/hosted/HostedMarketsGrid.tsx:160-184`](../packages/react-core/widgets-react/src/hosted/HostedMarketsGrid.tsx#L160-L184).

### Mechanism B — `augmentSnapshotWithLiveCustomData`

After dispatch, the platform calls
`fin.Platform.getCurrentSync().getSnapshot()`. Before persisting it,
the workspace-persistence override **re-reads live `customData` from
every view in the snapshot** and merges it in:

```ts
view.customData = { ...snapCd, ...liveCd };  // live wins
```

This is a defensive guarantee: even if `Platform.getSnapshot()` lags
behind a recent `View.updateOptions({ customData })` call (timing
race, missed update, future OpenFin behaviour change), the saved
snapshot is guaranteed to carry the latest `activeProfileId`.

Source: [`packages/openfin/openfin-platform/src/workspacePersistence.ts:211-252`](../packages/openfin/openfin-platform/src/workspacePersistence.ts#L211-L252).

### On restore

OpenFin re-opens each view with its saved `customData`. The grid
mounts → `ProfileManager.boot()` runs → `activeIdSource.read()`
returns the saved `activeProfileId` → boot loads that profile from
storage. The user sees what they left.

---

## 6. Standalone (non-OpenFin) flow

The same code, three things degrade gracefully:

| Component | Behaviour outside OpenFin |
|---|---|
| `createOpenFinViewProfileSource()` | Returns `null`. No source layer is installed on the manager. |
| `ProfileManager.boot()` | Skips the source read; falls straight to `localStorage[gc-active-profile:<gridId>]`. |
| `HostedMarketsGrid`'s `useWorkspaceSaveEvent` | Becomes a no-op (no OpenFin Channel to connect to). |

So the persistence chain shrinks to:

```
1. boot: candidate from localStorage → Default fallback
2. user explicit Save: writes profile bytes to adapter (ConfigService,
   LocalStorageBundle, Memory — whatever the host wired)
3. reload: same boot; localStorage pointer survives
```

No workspace, no per-view duplication — but every other guarantee
(persisting bytes, surviving reload, dirty tracking, switch-with-
unsaved-changes prompt) works identically.

---

## 7. Lifecycle: read, write, switch, save

| Operation | What writes to active-id pointers? |
|---|---|
| `boot()` resolves a profile | Yes — `writeActiveId` + `writeSourceId` (lines 221-222) |
| User picks profile in selector → `load(id)` | Yes — `writeActiveId` + `writeSourceId` |
| `create(name)` → activate clone | Yes |
| `clone(sourceId, name)` → activate the new row | Yes |
| `import(payload)` → activate (unless `{ activate: false }`) | Yes |
| `remove(activeId)` → fall back to Default | Yes |
| `save()` / `saveActiveProfile()` | No — only writes profile bytes |
| `discard()` — re-read active row from disk | No |
| `refresh()` — re-read profile list | No |

The pointer writes are deliberate user-intent commits. They tell the
workspace "this is what I want to come back to."

---

## 8. The Default profile lifecycle

- **Created**: On first `boot()` against an empty adapter. Stored as
  an empty `state: {}` snapshot.
- **Loadable as a fallback**: Whenever a candidate id doesn't resolve,
  the manager hydrates from the Default snapshot.
- **Cannot be**: renamed (throws), deleted (no-op), or used as a
  collision target by `create`, `clone`, or `import` (those validate
  against the reserved id and throw).
- **Can be**: edited and saved like any other profile. Cloning Default
  produces a normal user profile.

---

## 9. Identity scoping in production

When you use `createConfigServiceStorage`, every adapter call is
scoped by `(appId, userId, instanceId)`. This is what makes
"workspace-isolated storage rows" work — two views with different
`instanceId`s (or two users with different `userId`s) cannot see each
other's profiles.

`HostedMarketsGrid` derives these from OpenFin view `customData` or
from `defaultAppId`/`defaultUserId`/`defaultInstanceId` props in
browser mode. See
[`packages/react-core/widgets-react/src/hosted/useHostedIdentity.ts`](../packages/react-core/widgets-react/src/hosted/useHostedIdentity.ts).

If `appId` or `userId` is missing **and** the adapter is the
ConfigService factory, `<MarketsGrid>` throws at mount with a clear
error. This is intentional — silently writing rows under a default
scope would mix users together.

---

## 10. Anti-patterns

Things that look reasonable but break the contract:

### Don't auto-load a profile on `onReady` without preserving the source pointer

If a consumer's `onReady` callback unconditionally calls
`handle.profiles.loadProfile(activeId)` after columns mount, `load()`
re-writes the source pointer to whatever `activeId` currently is. If
`activeId` is `Default` because of a transient boot fallback, this
**clobbers the workspace's `customData.activeProfileId`** with
`Default` — destroying the user's last-selection intent across the
next save/restore.

If you need to re-bind state to late-mounting column defs, do it in
a way that does **not** touch the pointer. The current container
([`MarketsGridContainer.onReady`](../packages/react-core/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx#L358-L368))
does not call `loadProfile` for exactly this reason.

### Don't use `importProfile` as a way to "force the right Default"

`importProfile` is **always additive**. Calling it with
`{ name: 'Default', activate: true }` to "fix" a Default that lacks
some seed data will create `Default (imported 2)`, then
`Default (imported 3)`, etc., on every remount — and `activate: true`
flips the active id to the new duplicate, destroying the user's
selection.

If you need to seed Default with custom state, write the row
**directly through the adapter** before `MarketsGrid` mounts (e.g.
via `configManager.saveConfig(...)` in a pre-mount effect). On boot,
the manager will pick up the seeded Default normally.

### Don't try to make `localStorage` survive an OpenFin workspace restore

`localStorage` is per-browser. OpenFin views restored from a saved
workspace are fresh contexts. The pointer that survives restore is
**`customData.activeProfileId`**, written by `openfinViewProfile`.
localStorage is a per-browser fallback — useful for "I closed the
view and re-opened it in the same browser session", but not for
"I saved the workspace yesterday and re-opened today."

---

## 11. Key files (quick reference)

| Concern | File |
|---|---|
| Profile orchestration class | [`packages/shared/engine/src/profiles/ProfileManager.ts`](../packages/shared/engine/src/profiles/ProfileManager.ts) |
| `ActiveIdSource` interface | Same file, lines 18-40 |
| Profile types | [`packages/shared/engine/src/profiles/types.ts`](../packages/shared/engine/src/profiles/types.ts) |
| Reserved-id + localStorage key | [`packages/shared/engine/src/persistence/StorageAdapter.ts`](../packages/shared/engine/src/persistence/StorageAdapter.ts) |
| Memory adapter | [`packages/shared/engine/src/persistence/MemoryAdapter.ts`](../packages/shared/engine/src/persistence/MemoryAdapter.ts) |
| LocalStorage bundle adapter | [`packages/shared/engine/src/persistence/LocalStorageBundleAdapter.ts`](../packages/shared/engine/src/persistence/LocalStorageBundleAdapter.ts) |
| ConfigService factory | [`packages/data/host-config/src/profileStorage.ts`](../packages/data/host-config/src/profileStorage.ts) |
| React binding (hook) | [`packages/react-grid/grid/src/customizer/hooks/useProfileManager.ts`](../packages/react-grid/grid/src/customizer/hooks/useProfileManager.ts) |
| OpenFin per-view source | [`packages/react-grid/grid/src/widget/openfinViewProfile.ts`](../packages/react-grid/grid/src/widget/openfinViewProfile.ts) |
| Profile selector UI | [`packages/react-grid/grid/src/widget/ProfileSelector.tsx`](../packages/react-grid/grid/src/widget/ProfileSelector.tsx) |
| Workspace save channel | [`packages/openfin/openfin-platform/src/workspacePersistence.ts`](../packages/openfin/openfin-platform/src/workspacePersistence.ts) |
| Hosted wrapper save wiring | [`packages/react-core/widgets-react/src/hosted/HostedMarketsGrid.tsx`](../packages/react-core/widgets-react/src/hosted/HostedMarketsGrid.tsx), [`useWorkspaceSaveEvent.ts`](../packages/react-core/widgets-react/src/hosted/useWorkspaceSaveEvent.ts) |
| Hosted identity resolution | [`packages/react-core/widgets-react/src/hosted/useHostedIdentity.ts`](../packages/react-core/widgets-react/src/hosted/useHostedIdentity.ts) |
| Container mount + re-bind | [`packages/react-core/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx`](../packages/react-core/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx) |

---

## 12. Tests covering the contract

- [`packages/shared/engine/src/profiles/ProfileManager.test.ts`](../packages/shared/engine/src/profiles/ProfileManager.test.ts)
  — state propagation, switch isolation, delete cycles, disposed
  guards, reload persistence, phantom-profile regressions, clone
  semantics.
- [`packages/openfin/openfin-platform/src/workspacePersistence.test.ts`](../packages/openfin/openfin-platform/src/workspacePersistence.test.ts)
  and [`workspacePersistence.workspaceSave.test.ts`](../packages/openfin/openfin-platform/src/workspacePersistence.workspaceSave.test.ts)
  — workspace CRUD + the live-customData augmentation.
- [`e2e/v2-profile-lifecycle.spec.ts`](../e2e/v2-profile-lifecycle.spec.ts),
  [`v2-profile-isolation-*.spec.ts`](../e2e/),
  [`v2-profile-stress.spec.ts`](../e2e/v2-profile-stress.spec.ts) —
  end-to-end against the `demo-react` ConfigService adapter.
