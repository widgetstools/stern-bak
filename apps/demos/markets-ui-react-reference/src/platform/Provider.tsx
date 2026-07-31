import { useEffect, useState } from "react";
import * as Notifications from "@openfin/notifications";
import { initWorkspace } from "@wellsfargo-starui/openfin-platform";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";

/**
 * Provider — the OpenFin platform provider window.
 *
 * This is the first window that OpenFin loads. It calls initWorkspace()
 * to start the platform, register the dock, home, store, and notifications,
 * and set up all custom action handlers.
 *
 * Post-init, the window is hidden and idle. We use that idle time to
 * prefetch every tool-window route chunk in the background — so the
 * first open of DataProviders / ConfigBrowser / WorkspaceSetup / etc.
 * hits a warm HTTP and V8 code cache instead of a cold network +
 * parse. See `prefetchToolWindowChunks()` below.
 *
 * In production you would set `platform.autoShow: false` in manifest.fin.json
 * to keep this window hidden. In development, autoShow: true lets you see
 * the progress messages and inspect the window in DevTools.
 */

// Each entry is a lazy import that triggers the same Vite chunk a route
// would load. Names mirror the route component names so the console log
// and notification body line up with what the user opens.
const TOOL_WINDOW_CHUNK_LOADERS: Record<string, () => Promise<unknown>> = {
  DataProviders: () => import("../views/DataProviders"),
  ConfigBrowser: () => import("../views/ConfigBrowser"),
  BlottersMarketsGrid: () => import("../views/BlottersMarketsGrid"),
  WorkspaceSetupReact: () => import("@wellsfargo-starui/workspace-setup-react"),
  RenameViewTab: () => import("../views/RenameViewTab"),
};

async function prefetchToolWindowChunks(): Promise<void> {
  const start = performance.now();
  const entries = Object.entries(TOOL_WINDOW_CHUNK_LOADERS);
  const results = await Promise.allSettled(entries.map(([, load]) => load()));
  const elapsedMs = Math.round(performance.now() - start);
  const fulfilled = results.filter((r) => r.status === "fulfilled").length;
  const failures = entries
    .map(([name], i) => [name, results[i]] as const)
    .filter(([, r]) => r.status === "rejected")
    .map(([name, r]) => ({ name, reason: (r as PromiseRejectedResult).reason }));

  if (failures.length) {
    console.warn(
      `[provider] prefetched ${fulfilled}/${entries.length} tool-window chunks in ${elapsedMs}ms — ${failures.length} failed:`,
      failures,
    );
  } else {
    console.info(
      `[provider] prefetched ${fulfilled}/${entries.length} tool-window chunks in ${elapsedMs}ms`,
    );
  }

  // OpenFin notification (toast) — visible to the user without
  // opening the hidden provider window's DevTools. Skipped when running
  // outside OpenFin (e.g. dev server in a plain browser tab) since the
  // notifications API isn't available there.
  if (typeof fin === "undefined") return;
  const platformUuid = (fin as typeof import("@openfin/core").fin).me?.identity?.uuid;
  if (!platformUuid) return;
  try {
    await Notifications.create({
      platform: platformUuid,
      title: failures.length ? "Tool windows partially ready" : "Tool windows ready",
      body: `Prefetched ${fulfilled}/${entries.length} chunks in ${elapsedMs} ms`,
      toast: "transient",
    });
  } catch (err) {
    console.warn("[provider] failed to send prefetch notification:", err);
  }
}

function scheduleIdle(cb: () => void): void {
  type IdleAPI = {
    requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
  };
  const w = window as unknown as IdleAPI;
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(() => cb(), { timeout: 4000 });
  } else {
    setTimeout(cb, 1500);
  }
}

function Provider() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Initialise the platform first; only AFTER initWorkspace() has fully
    // resolved install the e2e test bridge.
    const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
    const e2eBridge =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("e2eBridge") === "1";

    initWorkspace({
      dockIcon: "http://localhost:5174/dock-provider.png",
      onProgress: setMessage,
      roles: ["admin", "developer"],
      components: { home: false, store: false },
    })
      .then(() => {
        if (!isDev && !e2eBridge) return undefined;
        return import("@wellsfargo-starui/host-wrapper-react/test-bridge").then((m) => m.installTestBridge());
      })
      .then(() => {
        // Fire-and-forget prefetch of tool-window route chunks. Runs at
        // the next idle slot (or 1.5s fallback) so it never contends
        // with platform-init work. Each chunk is a Vite-split route
        // that a future tool window would pull on first open — by
        // warming the HTTP and V8 code caches here, those windows
        // skip the cold parse on first launch.
        scheduleIdle(() => {
          void prefetchToolWindowChunks();
        });
      })
      .catch((err) => {
        console.error("Failed to initialize workspace platform:", err);
      });
  }, []); // Empty array — run once on mount, never again

  return (
    <div className="flex flex-col flex-1 gap-5">
      <header className="flex flex-row justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold">OpenFin Platform Window</h1>
          <p className="text-sm text-muted-foreground">Workspace platform window</p>
        </div>
      </header>
      <main className="flex flex-col gap-2.5">
        <Card>
          <CardHeader>
            <CardTitle>Platform Provider</CardTitle>
            <CardDescription>This window initializes the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <p>
              The window would usually be hidden. Set the platform.autoShow flag to false in
              manifest.fin.json to hide it on startup.
            </p>
            <p className="mt-2 font-medium">{message}</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default Provider;
