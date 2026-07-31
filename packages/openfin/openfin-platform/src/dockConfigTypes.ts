// ─── Serializable types (safe for IndexedDB / JSON) ─────────────────

export interface DockActionButtonConfig {
  type: "ActionButton";
  id: string;
  tooltip: string;
  iconUrl: string;
  /** Iconify icon ID (e.g. "lucide:file-text"). Stored so we can regenerate iconUrl for any theme. */
  iconId?: string;
  /**
   * User-chosen icon color (hex, e.g. "#0A76D3").
   * When set, the icon keeps this color regardless of dark/light theme.
   * When not set, the icon is recolored to match the current theme.
   */
  iconColor?: string;
  actionId: string;
  customData?: unknown;
}

export interface DockMenuItemConfig {
  id: string;
  tooltip: string;
  iconUrl?: string;
  /** Iconify icon ID (e.g. "lucide:file-text"). Stored so we can regenerate iconUrl for any theme. */
  iconId?: string;
  /**
   * User-chosen icon color (hex, e.g. "#0A76D3").
   * When set, the icon keeps this color regardless of dark/light theme.
   * When not set, the icon is recolored to match the current theme.
   */
  iconColor?: string;
  actionId?: string;
  customData?: unknown;
  /** Nested sub-menu items */
  options?: DockMenuItemConfig[];
}

export interface DockDropdownButtonConfig {
  type: "DropdownButton";
  id: string;
  tooltip: string;
  iconUrl: string;
  /** Iconify icon ID (e.g. "lucide:file-text"). Stored so we can regenerate iconUrl for any theme. */
  iconId?: string;
  /**
   * User-chosen icon color (hex, e.g. "#0A76D3").
   * When set, the icon keeps this color regardless of dark/light theme.
   * When not set, the icon is recolored to match the current theme.
   */
  iconColor?: string;
  options: DockMenuItemConfig[];
}

export type DockButtonConfig = DockActionButtonConfig | DockDropdownButtonConfig;

export interface DockEditorConfig {
  version: 1;
  buttons: DockButtonConfig[];
  updatedAt: string;
}

// ─── Dock3 entry types ────────────────────────────────────────────
// These match the shapes from @openfin/workspace-platform's Dock3 API.
// We define them here to avoid coupling the rest of the codebase to the
// OpenFin package types directly.

export type DockEntryIcon = string | { dark: string; light: string };

export interface Dock3ItemEntry {
  type: "item";
  id: string;
  label: string;
  icon: DockEntryIcon;
  itemData?: any;
}

export interface Dock3FolderEntry {
  type: "folder";
  id: string;
  label: string;
  icon?: DockEntryIcon;
  children: Dock3Entry[];
}

export type Dock3Entry = Dock3ItemEntry | Dock3FolderEntry;

// ─── ContentMenuEntry types (for dropdown menus) ──────────────────

export interface ContentMenuItemEntry {
  type: "item";
  id: string;
  label: string;
  icon: DockEntryIcon;
  itemData: any;
  bookmarked?: boolean;
}

export interface ContentMenuFolderEntry {
  type: "folder";
  id: string;
  label: string;
  children: ContentMenuEntryType[];
  bookmarked?: boolean;
}

export type ContentMenuEntryType = ContentMenuItemEntry | ContentMenuFolderEntry;

// ─── Classic dock (dock2) button shapes ──────────────────────────────
// Structurally compatible with @openfin/workspace's DockButton /
// CustomDropdownItem (the string literals match DockButtonNames values),
// so dock.ts can cast these to the OpenFin types at the register call
// without this module importing OpenFin.

/** A classic dock dropdown option (leaf carries `action`; nested has `options`). */
export interface Dock2Option {
  tooltip: string;
  iconUrl?: string;
  action?: { id: string; customData?: unknown };
  options?: Dock2Option[];
}

/** A classic top-level dock button (action button or dropdown). */
export interface Dock2Button {
  type: "ActionButton" | "DropdownButton";
  tooltip: string;
  iconUrl: string;
  action?: { id: string; customData?: unknown };
  options?: Dock2Option[];
}

/** Resolve a dual-theme icon (or string) to the live theme's single string. */
function pickThemeIcon(icon: DockEntryIcon, theme: "dark" | "light"): string {
  return typeof icon === "string" ? icon : (icon?.[theme] ?? "");
}

/**
 * Convert one DockMenuItemConfig (a dropdown option, possibly nested) into a
 * classic dock dropdown option. Leaves carry an `action`; items with children
 * become nested dropdowns. Icons resolve to a single string for the theme.
 */
export function toDock2Option(
  item: DockMenuItemConfig,
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
  theme: "dark" | "light",
): Dock2Option {
  const iconUrl = pickThemeIcon(
    makeDualIcon(item, generateIcon, recolorUrl, darkColor, lightColor), theme,
  );
  if (item.options && item.options.length > 0) {
    return {
      tooltip: item.tooltip,
      ...(iconUrl ? { iconUrl } : {}),
      options: item.options.map((child) =>
        toDock2Option(child, generateIcon, recolorUrl, darkColor, lightColor, theme),
      ),
    };
  }
  return {
    tooltip: item.tooltip,
    ...(iconUrl ? { iconUrl } : {}),
    action: { id: item.actionId ?? "", customData: item.customData },
  };
}

/**
 * Convert the user's DockEditorConfig buttons into classic dock buttons.
 * ActionButton → action button; DropdownButton → dock-bar dropdown whose
 * options (and nested options) carry their own icons.
 */
export function toDock2Buttons(
  config: DockEditorConfig,
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
  theme: "dark" | "light",
): Dock2Button[] {
  return config.buttons.map((btn): Dock2Button => {
    const iconUrl = pickThemeIcon(
      makeDualIcon(btn, generateIcon, recolorUrl, darkColor, lightColor), theme,
    );
    if (btn.type === "DropdownButton") {
      return {
        type: "DropdownButton",
        tooltip: btn.tooltip,
        iconUrl,
        // Submenu (dropdown flyout) is always dark in the classic dock —
        // an OpenFin Dock2 limitation — so resolve option icons against the
        // dark scheme (light/white glyphs) regardless of the live theme.
        // Otherwise light-theme options get dark glyphs that vanish on the
        // dark flyout. The top-level button icon above still follows `theme`
        // (it sits on the theme-following dock bar).
        options: btn.options.map((item) =>
          toDock2Option(item, generateIcon, recolorUrl, darkColor, lightColor, "dark"),
        ),
      };
    }
    return {
      type: "ActionButton",
      tooltip: btn.tooltip,
      iconUrl,
      action: { id: btn.actionId, customData: btn.customData },
    };
  });
}

// ─── Converter: serializable config → Dock3 DockEntry[] ─────────────

/**
 * Generate a dual-theme icon object for a button config.
 * If the button has a fixed iconColor, both dark and light use that color.
 * Otherwise, generates separate URLs for dark and light themes.
 */
export function makeDualIcon(
  btn: { iconUrl?: string; iconId?: string; iconColor?: string },
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
): DockEntryIcon {
  if (btn.iconColor) {
    // User chose a fixed color — same URL for both themes
    const url = btn.iconId
      ? generateIcon(btn.iconId, btn.iconColor)
      : btn.iconUrl ?? "";
    return url;
  }

  if (btn.iconId) {
    return {
      dark: generateIcon(btn.iconId, darkColor),
      light: generateIcon(btn.iconId, lightColor),
    };
  }

  if (btn.iconUrl) {
    const darkUrl = recolorUrl(btn.iconUrl, darkColor);
    const lightUrl = recolorUrl(btn.iconUrl, lightColor);
    return darkUrl === lightUrl ? darkUrl : { dark: darkUrl, light: lightUrl };
  }

  return "";
}

/**
 * Convert top-level dock buttons from a DockEditorConfig into Dock3 favorites
 * (the icon row on the dock bar).
 *
 * Both kinds of top-level button land here:
 *   - ActionButton   → Dock3 item   (icon + click → launch action)
 *   - DropdownButton  → Dock3 folder (icon + click → opens its content menu)
 *
 * The reason DropdownButtons appear here (not only in the content menu) is
 * that OpenFin's `ContentMenuEntry` folder shape has NO `icon` field, so a
 * top-level dropdown can never show its icon inside the content-menu dropdown
 * (verified against the v23 published types and the live dock). The dock-bar
 * `DockEntry` folder shape DOES support `icon?`, so we surface the icon there.
 *
 * Children are intentionally NOT carried on the favorites folder — the
 * `DockEntry` folder shape has no `children` field. The same DropdownButton is
 * also emitted by `toDock3UserContentMenu()` under the SAME id with its
 * children; OpenFin's Dock3 links the two by id, so clicking the dock-bar
 * folder opens its menu items.
 */
export function toDock3Favorites(
  config: DockEditorConfig,
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
): Dock3Entry[] {
  return config.buttons.map((btn): Dock3Entry => {
    const icon = makeDualIcon(btn, generateIcon, recolorUrl, darkColor, lightColor);
    if (btn.type === "DropdownButton") {
      return {
        type: "folder",
        id: btn.id,
        label: btn.tooltip,
        icon,
        // Children live in the matching content-menu folder (same id);
        // OpenFin links by id when the dock-bar folder is clicked.
        children: [],
      };
    }
    return {
      type: "item",
      id: btn.id,
      label: btn.tooltip,
      icon,
      itemData: {
        actionId: btn.actionId,
        customData: btn.customData,
      },
    };
  });
}

/**
 * Convert a single DockMenuItemConfig (which can have nested children)
 * into a ContentMenuEntry. Handles arbitrary nesting depth.
 */
function menuItemToContentMenuEntry(
  item: DockMenuItemConfig,
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
): ContentMenuEntryType {
  const icon = makeDualIcon(item, generateIcon, recolorUrl, darkColor, lightColor);

  // If this item has nested children, it's a folder
  if (item.options && item.options.length > 0) {
    return {
      type: "folder",
      id: item.id,
      label: item.tooltip,
      children: item.options.map((child) =>
        menuItemToContentMenuEntry(child, generateIcon, recolorUrl, darkColor, lightColor),
      ),
    };
  }

  // Leaf item
  return {
    type: "item",
    id: item.id,
    label: item.tooltip,
    icon: icon || "",
    itemData: {
      actionId: item.actionId,
      customData: item.customData,
    },
  };
}

/**
 * Convert DropdownButtons from a DockEditorConfig into Dock3 ContentMenuEntry[].
 * Each DropdownButton becomes a "folder" with its menu items as children.
 * Each ActionButton is skipped (those go into favorites).
 */
export function toDock3UserContentMenu(
  config: DockEditorConfig,
  generateIcon: (iconId: string, color: string) => string,
  recolorUrl: (url: string, color: string) => string,
  darkColor: string,
  lightColor: string,
): ContentMenuEntryType[] {
  return config.buttons
    .filter((btn): btn is DockDropdownButtonConfig => btn.type === "DropdownButton")
    .map((btn): ContentMenuEntryType => {
      const children = btn.options.map((item) =>
        menuItemToContentMenuEntry(item, generateIcon, recolorUrl, darkColor, lightColor),
      );
      return {
        type: "folder",
        id: btn.id,
        label: btn.tooltip,
        children,
      };
    });
}

/**
 * Convert the current manifest-based apps into a DockEditorConfig
 * so the editor can show them as the "default" state.
 *
 * In Dock3, ActionButtons appear directly on the dock bar (as favorites),
 * while DropdownButtons appear in the content menu dropdown.
 *
 * - ≤6 apps → individual ActionButtons (visible on dock bar)
 * - >6 apps → single DropdownButton "Apps" (in content menu to avoid overcrowding)
 */
const MAX_DOCK_BAR_APPS = 6;

export function appsToEditorConfig(
  apps: { appId: string; title: string; icons?: { src: string }[]; manifest?: string }[],
  fallbackIcon: string,
): DockEditorConfig {
  if (apps.length <= MAX_DOCK_BAR_APPS) {
    // Few apps — show each as a direct dock bar button
    const buttons: DockButtonConfig[] = apps.map((app) => ({
      type: "ActionButton" as const,
      id: `app-${app.appId}`,
      tooltip: app.title,
      iconUrl: app.icons?.length ? app.icons[0].src : fallbackIcon,
      actionId: "launch-app",
      customData: app,
    }));

    return {
      version: 1,
      buttons,
      updatedAt: new Date().toISOString(),
    };
  }

  // Many apps — group into a dropdown (appears in content menu)
  const options: DockMenuItemConfig[] = apps.map((app) => ({
    id: `app-${app.appId}`,
    tooltip: app.title,
    iconUrl: app.icons?.length ? app.icons[0].src : fallbackIcon,
    actionId: "launch-app",
    customData: app,
  }));

  return {
    version: 1,
    buttons: [
      {
        type: "DropdownButton",
        id: "apps",
        tooltip: "Apps",
        iconUrl: fallbackIcon,
        options,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}
