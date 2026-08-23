import React, { Suspense, use, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Outlet, Route, Routes } from "react-router-dom";
import App from "./App";
import "./styles.css";
import { applyTheme, getTheme } from "@wellsfargo-starui/design-system";
import { installBootWatchdog } from "./bootWatchdog";
applyTheme(getTheme());
installBootWatchdog();

import { StarGridApp } from "./starGridApp/index.js";
import { BrowserRuntime } from "@wellsfargo-starui/core/host/browser";
import { OpenFinRuntime, isOpenFin } from "@wellsfargo-starui/openfin/host";
import { useOpenFinThemeSync } from "./useOpenFinThemeSync";
import { DataHubProvider } from "@wellsfargo-starui/react/data/runtime";
import type { RuntimePort } from "@wellsfargo-starui/core/host";
import {
  initConfigBootstrap,
  initPlatformBootstrap,
  PlatformBootstrapProvider,
  usePlatformBootstrap,
  type PlatformBootstrapResult,
} from "./platformBootstrap";

const Provider            = React.lazy(() => import("./platform/Provider"));
const ConfigBrowser       = React.lazy(() => import("./views/ConfigBrowser"));
const RenameViewTab       = React.lazy(() => import("./views/RenameViewTab"));
/** Start downloading+parsing the MarketsGrid route chunk in parallel with platform bootstrap. */
const blottersMarketsGridChunk = import("./views/BlottersMarketsGrid");
const BlottersMarketsGrid = React.lazy(() => blottersMarketsGridChunk);
const DataProviders       = React.lazy(() => import("./views/DataProviders"));

const WorkspaceSetup = React.lazy(() =>
  import("@wellsfargo-starui/react/workspace-setup").then((m) => ({ default: m.WorkspaceSetup })),
);

/** Workspace-setup mounts outside StarGridApp/OpenFinRuntime, so it subscribes
 *  to the dock theme toggle directly (otherwise it freezes on the boot theme). */
function WorkspaceSetupRoute() {
  useOpenFinThemeSync();
  return <WorkspaceSetup />;
}

const LOADING = <div style={{ padding: 16 }}>Loading...</div>;

// Warm the bootstrap tier this window's initial route needs. Routes that
// never touch the data plane skip the SharedWorker hub entirely; the
// gates below still upgrade on in-window navigation to a data route.
// HashRouter: the route lives in location.hash ("#/rename-view-tab"),
// never in pathname — reading pathname here would send every window
// down the full platform bootstrap.
const initialPath = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
if (initialPath.startsWith("/rename-view-tab")) {
  // pure-fin dialog — needs neither config rows nor the data plane
} else if (initialPath.startsWith("/workspace-setup")) {
  void initConfigBootstrap();
} else {
  void initPlatformBootstrap();
}

/** Warm AG Grid vendor chunks while bootstrap runs (no-op if route chunk already started). */
if (typeof window !== "undefined" && window.location.hash.includes("/blotters/marketsgrid")) {
  void Promise.all([
    import("ag-grid-community"),
    import("ag-grid-enterprise"),
    import("ag-grid-react"),
  ]).catch(() => { /* dev-only prebundle warm-up */ });
}

/** Suspend on the config-only bootstrap (ConfigManager, no data hub). */
function ConfigGate({ children }: { children: ReactNode }) {
  use(initConfigBootstrap());
  return children;
}

/** Suspend on the full bootstrap (config + SharedWorker data hub). */
function FullGate({ children }: { children: ReactNode }) {
  const boot = use(initPlatformBootstrap());
  return (
    <PlatformBootstrapProvider value={boot}>
      <DataHubProvider platform={boot.platform} userId={boot.config.userId} hubInspector={false}>
        {children}
      </DataHubProvider>
    </PlatformBootstrapProvider>
  );
}

async function createRuntimeForViews(config: PlatformBootstrapResult['config']): Promise<RuntimePort> {
  if (isOpenFin()) {
    return OpenFinRuntime.create();
  }
  return new BrowserRuntime({
    identity: {
      appId: config.appId,
      userId: config.userId,
      componentType: "StarDemo",
    },
  });
}

function ViewRoutesLayout() {
  const boot = usePlatformBootstrap();
  const runtimePromise = React.useMemo(
    () => createRuntimeForViews(boot.config),
    [boot.config.appId, boot.config.userId],
  );

  return (
    <StarGridApp
      appId={boot.config.appId}
      userId={boot.config.userId}
      persistence="config"
      runtime={runtimePromise}
      configManager={boot.platform.configManager}
    >
      <Outlet />
    </StarGridApp>
  );
}

function AppTree() {
  return (
    <HashRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        {/* Config-only windows — no data hub. RenameViewTab is pure fin
            APIs + UI primitives and needs no bootstrap at all. */}
        <Route path="/rename-view-tab" element={<React.Suspense fallback={LOADING}><RenameViewTab /></React.Suspense>} />
        <Route path="/workspace-setup" element={<ConfigGate><React.Suspense fallback={LOADING}><WorkspaceSetupRoute /></React.Suspense></ConfigGate>} />

        {/* Provider window: dock + platform init only need the ConfigManager
            (initWorkspace picks it up via peekConfigManager). The full hub
            bootstrap is warmed in the background at module scope, keeping
            the SharedWorker alive across grid-window close/reopen. */}
        <Route path="/platform/provider" element={<ConfigGate><React.Suspense fallback={LOADING}><Provider /></React.Suspense></ConfigGate>} />

        {/* Data-plane windows — full bootstrap. ConfigBrowser stays here
            because it can edit data-provider rows, which must invalidate
            the worker catalog (wireWorkerCatalogSync). */}
        <Route path="/dataproviders" element={<FullGate><React.Suspense fallback={LOADING}><DataProviders /></React.Suspense></FullGate>} />
        <Route path="/config-browser" element={<FullGate><React.Suspense fallback={LOADING}><ConfigBrowser /></React.Suspense></FullGate>} />

        <Route element={<FullGate><ViewRoutesLayout /></FullGate>}>
          <Route path="/" element={<App />} />
          <Route
            path="/blotters/marketsgrid"
            element={
              <React.Suspense fallback={LOADING}>
                <BlottersMarketsGrid />
              </React.Suspense>
            }
          />
        </Route>
      </Routes>
    </HashRouter>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <Suspense fallback={LOADING}>
      <AppTree />
    </Suspense>
  </React.StrictMode>,
);
