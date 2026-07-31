/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;
import type OpenFin from "@openfin/core";
import type { App } from "@openfin/workspace";
import { AppManifestType, getCurrentSync } from "@openfin/workspace-platform";
import { getConfigManager, loadRegistryConfig } from "./db";
import {
  generateTemplateConfigId,
  mintRegisteredInstanceId,
  type RegistryEntry,
} from "./registryConfigTypes";
import { DEFAULT_USER_ID } from "./registryHostEnv";
import { appendLaunchIdentityParams, resolveHostUrl } from "./hostUrl";

// ─── Singleton in-flight + opened registry ───────────────────────────
//
// Map of singleton configId -> the View|Window currently owning that
// singleton. Used to enforce focus-or-open semantics: a second click
// on a singleton dock item awaits the first launch's promise (handles
// rapid double-clicks) and then focuses the same window instead of
// creating a duplicate.
//
// Entries are removed on close so a closed-then-relaunched singleton
// behaves like a fresh launch (creates a new instance bound to the
// same configId so its persisted config is restored).

type SingletonOwner = OpenFin.View | OpenFin.Window;

const singletons = new Map<string, Promise<SingletonOwner>>();

function attachSingletonCleanup(configId: string, owner: SingletonOwner): void {
  const o = owner as any;
  if (typeof o.on !== 'function') return;

  // OpenFin emits different lifecycle-end events depending on owner type:
  //   • Window — 'closed' fires when the user closes a standalone Window.
  //   • View   — 'destroyed' fires when the View is torn down (including
  //              when its host window closes; 'closed' is NOT a View event).
  // Listening to both makes cleanup robust regardless of which API path
  // produced the singleton (asWindow vs createView).
  //
  // Defensive: only delete the Map entry if WE are still the registered
  // owner. A rapid close-then-relaunch can replace us with a fresh
  // promise before the late 'destroyed' event arrives — without this
  // guard we'd accidentally drop the live entry.
  const cleanup = () => {
    const current = singletons.get(configId);
    if (!current) return;
    current
      .then((stillOwner) => {
        if (stillOwner === owner) singletons.delete(configId);
      })
      .catch(() => {
        singletons.delete(configId);
      });
  };

  // `on()` is async; swallow any registration errors so a hostile
  // implementation can't break the launcher.
  Promise.resolve(o.on('closed', cleanup)).catch(() => {});
  Promise.resolve(o.on('destroyed', cleanup)).catch(() => {});
}

/**
 * Attempt to focus an existing singleton. Returns `true` on success.
 *
 * Returns `false` when the owner appears to be gone — typically because
 * the user closed it but our 'destroyed' / 'closed' listener hasn't
 * fired yet (or never will, e.g. the host window crashed). The caller
 * is expected to drop the stale Map entry and launch a fresh instance.
 *
 * Distinguishing "owner is dead" from "transient focus error" is hard
 * with OpenFin's current error shapes — `View.focus()` internally calls
 * `getCurrentWindow()` and any failure there bubbles up as a generic
 * `RuntimeError`. We treat ALL focus failures as fatal-for-the-singleton
 * and recreate. Worst case a re-creation is one extra view-mount; best
 * case the user gets unstuck without having to restart the platform.
 */
async function focusSingleton(owner: SingletonOwner): Promise<boolean> {
  try {
    const o = owner as any;
    if (typeof o.focus === 'function') await o.focus();
    if (typeof o.setAsForeground === 'function') await o.setAsForeground();
    if (typeof o.bringToFront === 'function') await o.bringToFront();
    return true;
  } catch (err) {
    console.warn('[launch] focus failed — treating singleton as stale:', err);
    return false;
  }
}

export async function launchApp(
  app: App
): Promise<OpenFin.Platform | OpenFin.Identity | OpenFin.View | OpenFin.Application | undefined> {
  if (!app.manifest) {
    console.error(`No manifest was provided for type ${app.manifestType}`);
    return;
  }

  let ret: OpenFin.Platform | OpenFin.Identity | OpenFin.View | OpenFin.Application | undefined;

  console.log("Application launch requested:", app);

  switch (app.manifestType) {
    case AppManifestType.Snapshot: {
      const platform = getCurrentSync();
      ret = await platform.applySnapshot(app.manifest);
      break;
    }
    case AppManifestType.View: {
      const platform = getCurrentSync();
      ret = await platform.createView({ manifestUrl: app.manifest });
      break;
    }
    case AppManifestType.External: {
      ret = await fin.System.launchExternalProcess({ path: app.manifest, uuid: app.appId });
      break;
    }
    default: {
      ret = await fin.Application.startFromManifest(app.manifest);
      break;
    }
  }

  console.log("Finished application launch request");
  return ret;
}

// ─── Launch a registered component (by registry entry id) ────────────

export interface LaunchRegisteredComponentOptions {
  /**
   * When true, launch in a standalone OpenFin Window. When false (or
   * omitted) launch as an OpenFin View inside the current Platform —
   * matches the registry-editor's existing testComponent() default.
   */
  asWindow?: boolean;
}

/**
 * Look up `entryId` in the live Component Registry, then launch its
 * component. Fire-and-forget for error paths — logs a warning and
 * returns undefined if the id doesn't resolve, but does NOT throw.
 * Dock-menu clicks should never hard-fail because a referenced
 * registry entry was deleted.
 *
 * Runtime customData is built the same way
 * `registry-editor/testComponent()` builds it, so views launched from
 * the dock behave identically to those launched from the registry
 * editor's test button.
 */
export async function launchRegisteredComponent(
  entryId: string,
  opts: LaunchRegisteredComponentOptions = {},
): Promise<OpenFin.View | OpenFin.Window | undefined> {
  const registry = await loadRegistryConfig();
  const entry = registry?.entries.find((e) => e.id === entryId);

  if (!entry) {
    console.warn(
      `[launchRegisteredComponent] registry entry id '${entryId}' not found. ` +
      `It may have been deleted since this dock item was saved.`,
    );
    return undefined;
  }

  // ── Singleton focus-or-open ────────────────────────────────────────
  // For singleton entries, the same configId identifies BOTH the
  // persistent config row AND the running window. A second click must
  // never spawn a duplicate — it awaits the first launch's promise
  // (which also handles rapid double-clicks racing through the lookup)
  // and then focuses the existing owner.
  if (entry.singleton && entry.configId) {
    const inFlight = singletons.get(entry.configId);
    if (inFlight) {
      try {
        const owner = await inFlight;
        const focused = await focusSingleton(owner);
        if (focused) return owner;
        // focus() failed — the owner is almost certainly gone (user
        // closed it before our 'destroyed' listener fired, or the host
        // window crashed). Drop the stale Map entry, then fall through
        // to the fresh-launch path below using the same configId so
        // the persisted config row is restored.
        if (singletons.get(entry.configId) === inFlight) {
          singletons.delete(entry.configId);
        }
      } catch {
        // The previous launch threw — fall through and try a fresh launch
        if (singletons.get(entry.configId) === inFlight) {
          singletons.delete(entry.configId);
        }
      }
    }
    const launchPromise = createComponentInstance(entry, opts, /* singletonId */ entry.configId);
    singletons.set(entry.configId, launchPromise);
    try {
      const owner = await launchPromise;
      attachSingletonCleanup(entry.configId, owner);
      return owner;
    } catch (err) {
      singletons.delete(entry.configId);
      throw err;
    }
  }

  return createComponentInstance(entry, opts);
}

/**
 * Eagerly clone the template's config row onto a fresh per-instance
 * row at `instanceId`. The clone starts before window creation and runs
 * concurrently with it — the view's first config read happens only after
 * the window's renderer boots and the app bundle loads (hundreds of ms at
 * minimum), so the clone lands long before any consumer reads the row.
 * The view then reads its own row directly — no lazy seed-from-template
 * inside the storage adapter, no dual-adapter race.
 *
 * Why eager: a single hosted MarketsGrid builds two storage adapters
 * (one in MarketsGridContainer for gridLevelData, one in <MarketsGrid>
 * for profiles). With lazy seeding both adapters would race the seed
 * write and the loser threw VersionConflict. Cloning at launch makes
 * the row exist before any consumer reads it — read paths simplify to
 * "getConfig by id" and the race vanishes.
 *
 * Behavior:
 *   - Best-effort: if the template row doesn't exist or the write
 *     fails, the launch still proceeds. The view gets an empty row
 *     (same as a first-ever launch), the user authors state, the
 *     normal save path persists it.
 *   - Identity flip: the cloned row carries `isTemplate: false`,
 *     `singleton: false`. Workspace GC's existing rules then dispose
 *     the row when the view isn't referenced by any saved workspace,
 *     so dock-launches the user immediately closes don't accumulate.
 *   - Display text: marks the row as "<template-display>: <short-id>"
 *     so Config Browser shows clearly which template it descended from.
 */
async function cloneTemplateRowForInstance(
  templateConfigId: string,
  instanceId: string,
  entry: RegistryEntry,
): Promise<void> {
  try {
    const cm = await getConfigManager();
    const src = await cm.getConfig(templateConfigId);
    if (!src) return; // no template row yet — nothing to clone
    const now = new Date().toISOString();
    const shortId = instanceId.slice(0, 8);
    await cm.saveConfig({
      ...src,
      configId: instanceId,
      displayText: `${src.displayText || entry.displayName || entry.componentType}: ${shortId}`,
      isTemplate: false,
      singleton: false,
      creationTime: now,
      updatedTime: now,
    });
  } catch (err) {
    console.warn(
      `[launch] template clone failed for ${templateConfigId} → ${instanceId} — view will start empty:`,
      err,
    );
  }
}

/**
 * Create the actual View or Window for a registry entry. Extracted from
 * launchRegisteredComponent so the singleton path can both reuse it AND
 * register the resulting promise in the singletons Map.
 *
 * When `singletonId` is provided, customData.instanceId === customData.templateId
 * === singletonId. component-host's `resolveInstanceId()` then loads the
 * existing config row at that id (case 1: workspace-restore-style). For
 * non-singleton callers the instanceId is a fresh UUID, and the
 * template's config row is eagerly cloned onto that UUID before the
 * view opens — see `cloneTemplateRowForInstance`.
 */
async function createComponentInstance(
  entry: RegistryEntry,
  opts: LaunchRegisteredComponentOptions,
  singletonId?: string,
): Promise<SingletonOwner> {
  // Singletons reuse their templateId as instanceId (all callers share
  // one row). Non-singletons get a fresh id in the canonical format
  // `${userId}${componentType}-${componentSubType}-${Date.now()}`. See
  // `mintRegisteredInstanceId` for the format rationale.
  const instanceId = singletonId ?? mintRegisteredInstanceId(
    DEFAULT_USER_ID,
    entry.componentType,
    entry.componentSubType,
  );

  const templateId = entry.configId ||
    generateTemplateConfigId(entry.componentType, entry.componentSubType);

  // Non-singleton launch: clone the template's row onto the fresh
  // instanceId so the view's storage reads hit a populated row directly.
  // Started here and awaited alongside window creation below — the OS
  // window appears immediately instead of waiting out the config
  // read+write, while the clone still completes well before the view's
  // renderer boots far enough to read the row (see
  // cloneTemplateRowForInstance). Singletons skip this — instanceId
  // === templateId, the view IS the template.
  const clonePromise = singletonId
    ? Promise.resolve()
    : cloneTemplateRowForInstance(templateId, instanceId, entry);

  const customData = {
    instanceId,
    templateId,
    componentType: entry.componentType,
    componentSubType: entry.componentSubType,
    appId: entry.appId,
    configServiceUrl: entry.configServiceUrl,
    // Mark singleton launches so component-host stamps `singleton: true`
    // on the persisted row, keeping it self-describing for downstream
    // consumers. `singletonId` is set in the singleton-aware
    // launchRegisteredComponent branch (entry.singleton && entry.configId);
    // non-singleton spawns leave this falsy.
    singleton: singletonId !== undefined,
  };

  // Resolve relative hostUrls (e.g. "/blotters/marketsgrid") against the
  // platform-provider window's origin before passing to OpenFin.
  const resolvedUrl = appendLaunchIdentityParams(resolveHostUrl(entry.hostUrl), instanceId);

  if (opts.asWindow) {
    const platform = getCurrentSync();
    const [win] = await Promise.all([
      platform.createWindow({
        url: resolvedUrl,
        name: `registered-${entry.id}-${instanceId}`,
        defaultWidth: 1200,
        defaultHeight: 800,
        autoShow: true,
        customData,
      }),
      clonePromise,
    ]);
    return win;
  }

  const platform = getCurrentSync();
  const [view] = await Promise.all([
    platform.createView({
      url: resolvedUrl,
      customData,
    } as unknown as Parameters<ReturnType<typeof getCurrentSync>["createView"]>[0]),
    clonePromise,
  ]);
  return view;
}
