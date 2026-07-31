import { useEffect } from "react";
import { applyTheme, getTheme } from "@wellsfargo-starui/design-system";
import { subscribeThemeBroadcast } from "@wellsfargo-starui/host-openfin";

/**
 * Keep a non-grid tool window in sync with the dock theme toggle.
 *
 * Grid views inherit theme changes through `StarGridApp` → `OpenFinRuntime`,
 * which subscribes to the dock's `theme-changed` broadcast. The config-only
 * tool routes (`/dataproviders`, `/workspace-setup`) mount *outside* that
 * shell, so without this hook they freeze on whatever theme was active at
 * boot. We subscribe directly and re-apply through the design-system
 * `applyTheme` so `data-theme` (and the AG-Grid mode attribute) flip and the
 * OKLCH tokens re-resolve, while preserving the user's cvd / light-variant.
 */
export function useOpenFinThemeSync(): void {
  useEffect(
    () =>
      subscribeThemeBroadcast((theme) => {
        applyTheme({ ...getTheme(), theme });
      }),
    [],
  );
}
