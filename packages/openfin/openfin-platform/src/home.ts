import {
  CLITemplate,
  Home,
  type App,
  type HomeDispatchedSearchResult,
  type HomeProvider,
  type HomeRegistration,
  type HomeSearchListenerRequest,
  type HomeSearchListenerResponse,
  type HomeSearchResponse,
  type HomeSearchResult
} from "@openfin/workspace";
import { launchApp } from './launch';
import type { PlatformSettings } from './types';

export async function registerHome(
  platformSettings: PlatformSettings,
  apps?: App[]
): Promise<HomeRegistration | undefined> {
  console.log("Initializing home.");

  const homeProvider: HomeProvider = {
    ...platformSettings,
    onUserInput: async (
      request: HomeSearchListenerRequest,
      _response: HomeSearchListenerResponse
    ): Promise<HomeSearchResponse> => {
      const queryLower = request.query.toLowerCase();
      if (queryLower.startsWith("/")) {
        return { results: [] };
      }
      return {
        results: mapAppEntriesToSearchEntries(apps ?? [])
      };
    },
    onResultDispatch: async (result: HomeDispatchedSearchResult): Promise<void> => {
      if (result.data !== undefined) {
        await launchApp(result.data as App);
      } else {
        console.warn("Unable to execute result without data being passed");
      }
    }
  };

  const homeRegistration = await Home.register(homeProvider);
  console.log("Home configured.");
  return homeRegistration;
}

function mapAppEntriesToSearchEntries(apps: App[]): HomeSearchResult[] {
  const results: HomeSearchResult[] = [];

  if (Array.isArray(apps)) {
    for (const app of apps) {
      const action = { name: "Launch View", hotkey: "enter" };
      const entry: Partial<HomeSearchResult> = {
        key: app.appId,
        title: app.title,
        data: app,
        description: app.description,
        shortDescription: app.description,
        template: CLITemplate.SimpleText,
        templateContent: app.description
      };

      if (app.manifestType === "view") {
        entry.label = "View";
        entry.actions = [action];
      } else if (app.manifestType === "snapshot") {
        entry.label = "Snapshot";
        action.name = "Launch Snapshot";
        entry.actions = [action];
      } else if (app.manifestType === "manifest") {
        entry.label = "App";
        action.name = "Launch App";
        entry.actions = [action];
      } else if (app.manifestType === "external") {
        action.name = "Launch Native App";
        entry.label = "Native App";
        entry.actions = [action];
      }

      if (Array.isArray(app.icons) && app.icons.length > 0) {
        entry.icon = app.icons[0].src;
      }

      results.push(entry as HomeSearchResult);
    }
  }

  return results;
}
