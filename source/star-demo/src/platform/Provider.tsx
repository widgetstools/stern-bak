import { useEffect, useState } from "react";
import { initWorkspace, ACTION_EXPORT_CONFIG, ACTION_IMPORT_CONFIG } from "@wellsfargo-starui/openfin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";

/**
 * Provider — the OpenFin platform provider window.
 *
 * This is the first window OpenFin loads (manifest `platform.providerUrl`).
 * It calls initWorkspace() to start the platform, register the dock, and
 * wire all custom action handlers. The window is hidden in production
 * (`platform.autoShow: false`); we use its idle time to prefetch the
 * tool-window route chunks so their first open is warm.
 *
 * The dock's ▾ Tools menu omits "Import Config" and "Export Config" via
 * `dock.excludeTools` — those entries are built into @wellsfargo-starui/openfin
 * and hidden here by their action IDs.
 */

// Each entry triggers the same Vite chunk a tool-window route would load,
// so the first open hits a warm HTTP + V8 code cache.
const TOOL_WINDOW_CHUNK_LOADERS: Record<string, () => Promise<unknown>> = {
  DataProviders: () => import("../views/DataProviders"),
  ConfigBrowser: () => import("../views/ConfigBrowser"),
  BlottersMarketsGrid: () => import("../views/BlottersMarketsGrid"),
  WorkspaceSetupReact: () => import("@wellsfargo-starui/react/workspace-setup"),
  RenameViewTab: () => import("../views/RenameViewTab"),
};

async function prefetchToolWindowChunks(): Promise<void> {
  const start = performance.now();
  const entries = Object.entries(TOOL_WINDOW_CHUNK_LOADERS);
  const results = await Promise.allSettled(entries.map(([, load]) => load()));
  const elapsedMs = Math.round(performance.now() - start);
  const fulfilled = results.filter((r) => r.status === "fulfilled").length;
  if (fulfilled < entries.length) {
    console.warn(`[provider] prefetched ${fulfilled}/${entries.length} tool-window chunks in ${elapsedMs}ms`);
  } else {
    console.info(`[provider] prefetched ${fulfilled}/${entries.length} tool-window chunks in ${elapsedMs}ms`);
  }
}

function Provider() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
    const e2eBridge =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("e2eBridge") === "1";

    // Warm tool-window chunks immediately — do not wait for initWorkspace to finish.
    void prefetchToolWindowChunks();

    initWorkspace({
      dockIcon: "http://localhost:5175/dock-provider.png",
      onProgress: setMessage,
      roles: ["admin", "developer"],
      components: { home: false, store: false },
      // Hide the built-in Import/Export Config items from the dock Tools menu.
      dock: { excludeTools: [ACTION_EXPORT_CONFIG, ACTION_IMPORT_CONFIG] },
    })
      .then(() => {
        if (!isDev && !e2eBridge) return undefined;
        return import("@wellsfargo-starui/react/host/test-bridge").then((m) => m.installTestBridge());
      })
      .catch((err) => {
        console.error("Failed to initialize workspace platform:", err);
      });
  }, []); // run once on mount

  return (
    <div className="flex flex-col flex-1 gap-5">
      <header className="flex flex-col">
        <h1 className="text-xl font-bold">Star Demo · Platform Provider</h1>
        <p className="text-sm text-muted-foreground">Workspace platform window</p>
      </header>
      <main className="flex flex-col gap-2.5">
        <Card>
          <CardHeader>
            <CardTitle>Platform Provider</CardTitle>
            <CardDescription>This window initializes the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <p>
              The window is usually hidden (platform.autoShow: false in
              manifest.fin.json).
            </p>
            <p className="mt-2 font-medium">{message}</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default Provider;
