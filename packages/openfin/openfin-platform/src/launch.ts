/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;
import type OpenFin from "@openfin/core";
import type { App } from "@openfin/workspace";
import { AppManifestType, getCurrentSync } from "@openfin/workspace-platform";
import { loadRegistryConfig } from "./db";
import { deriveTemplateConfigId, type RegistryEntry } from "./registryConfigTypes";
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

/** Test-only: wipe singleton focus-or-open cache between vitest cases. */
export function __resetLaunchSingletonsForTests(): void {
  singletons.clear();
}

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
 * Every launch runs on the registry entry's TEMPLATE config row: the
 * instanceId is the template's configId (`componenttype-subcomponenttype`),
 * the same row Workspace Setup's "Configure Component" edits, so all
 * instances of a component share its profiles and provider selection and
 * no per-instance rows are created (they were orphans unless a saved
 * workspace claimed them, and workspace GC deletion is off). Per-view
 * state — the active profile, the tab title — rides on the view's
 * `customData`, which the workspace snapshot round-trips. Runtime
 * customData is built the same way `registry-editor/testComponent()`
 * builds it, so views launched from the dock behave identically to those
 * launched from the registry editor's test button.
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
    const launchPromise = createComponentInstance(entry, opts);
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
 * Create the actual View or Window for a registry entry. Extracted from
 * launchRegisteredComponent so the singleton path can both reuse it AND
 * register the resulting promise in the singletons Map.
 *
 * `customData.instanceId === customData.templateId` — the template's
 * configId — for every launch. The view's storage then reads and writes
 * that row directly; `isTemplate: true` on the customData keeps the row
 * flagged as the component's template on every save (workspace GC never
 * reaps templates; Workspace Setup lists them). Singleton entries differ
 * only in focus-or-open (see launchRegisteredComponent), not in the row.
 */
async function createComponentInstance(
  entry: RegistryEntry,
  opts: LaunchRegisteredComponentOptions,
): Promise<SingletonOwner> {
  const templateId = entry.configId ||
    deriveTemplateConfigId(entry.componentType, entry.componentSubType);
  const instanceId = templateId;

  const customData = {
    instanceId,
    templateId,
    componentType: entry.componentType,
    componentSubType: entry.componentSubType,
    appId: entry.appId,
    configServiceUrl: entry.configServiceUrl,
    isTemplate: true,
    singleton: entry.singleton === true,
  };

  // Resolve relative hostUrls (e.g. "/blotters/marketsgrid") against the
  // platform-provider window's origin before passing to OpenFin. Every
  // instance of the component carries the same `?instanceId=`; the
  // view's own name is what tells instances apart.
  const resolvedUrl = appendLaunchIdentityParams(resolveHostUrl(entry.hostUrl), instanceId);
  const t0 = Date.now();

  if (opts.asWindow) {
    const platform = getCurrentSync();
    const win = await platform.createWindow({
      url: resolvedUrl,
      name: `registered-${entry.id}-${instanceId}-${t0}`,
      defaultWidth: 1200,
      defaultHeight: 800,
      autoShow: true,
      customData,
    });
    console.info(`[launch] ${entry.id} → ${instanceId}: window ${Date.now() - t0}ms`);
    return win;
  }

  const platform = getCurrentSync();
  const view = await platform.createView({
    url: resolvedUrl,
    customData,
  } as unknown as Parameters<ReturnType<typeof getCurrentSync>["createView"]>[0]);
  console.info(`[launch] ${entry.id} → ${instanceId}: view ${Date.now() - t0}ms`);
  return view;
}
