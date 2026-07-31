import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import App from "./App";
import "./index.css";
import { applyTheme, getTheme } from "@wellsfargo-starui/design-system";
applyTheme(getTheme());

import { StarGridApp } from "@wellsfargo-starui/app";
import { BrowserRuntime } from "@wellsfargo-starui/host-browser";
import { OpenFinRuntime, isOpenFin } from "@wellsfargo-starui/host-openfin";
import { DataHubProvider } from "@wellsfargo-starui/host-data-react/runtime";
import type { RuntimePort } from "@wellsfargo-starui/host";
import {
  getBootstrapConfig,
  getPlatform,
  initPlatformBootstrap,
} from "./platformBootstrap";

const Provider    = React.lazy(() => import("./platform/Provider"));
const View1       = React.lazy(() => import("./views/View1"));
const View2       = React.lazy(() => import("./views/View2"));
const ConfigBrowser   = React.lazy(() => import("./views/ConfigBrowser"));
const RenameViewTab   = React.lazy(() => import("./views/RenameViewTab"));
const BlottersMarketsGrid = React.lazy(() => import("./views/BlottersMarketsGrid"));
const DataProviders = React.lazy(() => import("./views/DataProviders"));

const ImportConfig = React.lazy(() =>
  import("@wellsfargo-starui/workspace-setup-react").then((m) => ({ default: m.ImportConfig })),
);
const WorkspaceSetup = React.lazy(() =>
  import("@wellsfargo-starui/workspace-setup-react").then((m) => ({ default: m.WorkspaceSetup })),
);

const LOADING = <div style={{ padding: 16 }}>Loading...</div>;

async function createRuntimeForViews(): Promise<RuntimePort> {
  if (isOpenFin()) {
    return OpenFinRuntime.create();
  }
  const config = getBootstrapConfig();
  return new BrowserRuntime({
    identity: {
      appId: config.appId,
      userId: config.userId,
      componentType: "MarketsUIReactReference",
    },
  });
}

const { config, platform } = await initPlatformBootstrap();
const runtimePromise = createRuntimeForViews();

function ViewRoutesStarGridShell() {
  return (
    <StarGridApp
      appId={config.appId}
      userId={config.userId}
      persistence="config"
      runtime={runtimePromise}
      configManager={getPlatform().configManager}
    >
      <Outlet />
    </StarGridApp>
  );
}

function ViewRoutesLayout() {
  return <ViewRoutesStarGridShell />;
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <DataHubProvider platform={platform} userId={config.userId}>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/platform/provider" element={<Provider />} />
          <Route element={<Outlet />}>
            <Route
              path="/dataproviders"
              element={
                <React.Suspense fallback={LOADING}>
                  <DataProviders />
                </React.Suspense>
              }
            />
            <Route path="/config-browser" element={<React.Suspense fallback={LOADING}><ConfigBrowser /></React.Suspense>} />
            <Route path="/import-config" element={<React.Suspense fallback={LOADING}><ImportConfig /></React.Suspense>} />
            <Route path="/workspace-setup" element={<React.Suspense fallback={LOADING}><WorkspaceSetup /></React.Suspense>} />
            <Route path="/rename-view-tab" element={<React.Suspense fallback={LOADING}><RenameViewTab /></React.Suspense>} />
          </Route>
          <Route element={<ViewRoutesLayout />}>
            <Route path="/" element={<App />} />
            <Route path="/views/view1" element={<View1 />} />
            <Route path="/views/view2" element={<View2 />} />
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
      </BrowserRouter>
    </DataHubProvider>
  </React.StrictMode>,
);
