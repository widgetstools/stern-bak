import { useMemo, type CSSProperties } from 'react';
import type { AnyModule } from '@wellsfargo-starui/core';
import {
  Menubar,
  MenubarContent,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarTrigger,
} from '@wellsfargo-starui/react';

/**
 * Grouped menubar navigation for Grid Customizer modules.
 *
 * Replaces the scrollable horizontal tab strip: with 15+ registered
 * modules the strip overflowed and most destinations sat behind caret
 * scrolling. The menubar collapses the modules into five stable
 * categories, so every module is reachable in two clicks with zero
 * scrolling, and the bar never overflows regardless of how many
 * modules a host registers.
 *
 * Contract notes:
 *   - Items keep the `v2-settings-nav-menu-<id>` testid the e2e helpers
 *     target; each group trigger carries `v2-settings-nav-group-<group>`
 *     plus a space-separated `data-modules` list so helpers can resolve
 *     "which menu owns module X" without duplicating the grouping map.
 *   - Modules whose id isn't in any category land in a trailing MORE
 *     menu — host-registered custom modules stay reachable.
 *   - Radix Menubar portals its content through
 *     `useResolvedPortalContainer`, so menus open in the popout window
 *     when the sheet is popped out.
 */

/**
 * Category display order + labels. Which category a module belongs to is
 * the module's own `category` field (`Module.category`) — adding a module
 * to a menu means declaring the category on the module, not editing this
 * file.
 */
const MODULE_GROUPS: readonly { id: string; label: string }[] = [
  { id: 'options', label: 'Options' },
  { id: 'columns', label: 'Columns' },
  { id: 'styling', label: 'Styling' },
  { id: 'editing', label: 'Editing' },
  { id: 'data', label: 'Data' },
];

/** Catch-all menu for modules with an unknown or missing `category`. */
const FALLBACK_GROUP = { id: 'more', label: 'More' } as const;

export interface ModuleMenubarGroup {
  id: string;
  label: string;
  modules: AnyModule[];
}

/**
 * Buckets `modules` by their `category` into the declared groups
 * (declaration order, empty groups dropped; items keep registration
 * order). Modules with no/unknown category — e.g. host-registered custom
 * modules — collect into a trailing MORE group in registration order.
 */
export function groupModulesForMenubar(modules: AnyModule[]): ModuleMenubarGroup[] {
  const knownIds = new Set(MODULE_GROUPS.map((g) => g.id));

  const groups: ModuleMenubarGroup[] = [];
  for (const def of MODULE_GROUPS) {
    const members = modules.filter((m) => m.category === def.id);
    if (members.length > 0) {
      groups.push({ id: def.id, label: def.label, modules: members });
    }
  }

  const leftovers = modules.filter((m) => !m.category || !knownIds.has(m.category));
  if (leftovers.length > 0) {
    groups.push({ ...FALLBACK_GROUP, modules: leftovers });
  }

  return groups;
}

export interface SettingsModuleMenubarProps {
  modules: AnyModule[];
  activeId: string;
  onActiveIdChange: (id: string) => void;
  /** Opt out of OpenFin frameless drag region on interactive controls. */
  frameless?: boolean;
}

export function SettingsModuleMenubar({
  modules,
  activeId,
  onActiveIdChange,
  frameless = false,
}: SettingsModuleMenubarProps) {
  const groups = useMemo(() => groupModulesForMenubar(modules), [modules]);

  const noDrag = frameless
    ? ({ WebkitAppRegion: 'no-drag' } as CSSProperties)
    : undefined;

  const activeGroup = groups.find((g) => g.modules.some((m) => m.id === activeId));
  const activeModule = activeGroup?.modules.find((m) => m.id === activeId);

  if (groups.length === 0) return null;

  return (
    <div
      className="ds-settings-menubar-bar"
      data-testid="v2-settings-module-menubar"
      style={noDrag}
    >
      <Menubar className="ds-settings-menubar" aria-label="Grid customizer modules">
        {groups.map((group) => {
          const containsActive = group.id === activeGroup?.id;
          return (
            <MenubarMenu key={group.id}>
              <MenubarTrigger
                className="ds-settings-menubar-trigger"
                data-testid={`v2-settings-nav-group-${group.id}`}
                data-modules={group.modules.map((m) => m.id).join(' ')}
                data-active={containsActive ? '' : undefined}
              >
                {group.label}
              </MenubarTrigger>
              <MenubarContent
                className="ds-sheet-v2 ds-settings-menubar-content"
                align="start"
                sideOffset={2}
              >
                <MenubarRadioGroup value={activeId} onValueChange={onActiveIdChange}>
                  {group.modules.map((m) => (
                    <MenubarRadioItem
                      key={m.id}
                      value={m.id}
                      className="ds-settings-menubar-item"
                      data-testid={`v2-settings-nav-menu-${m.id}`}
                    >
                      {m.name}
                    </MenubarRadioItem>
                  ))}
                </MenubarRadioGroup>
              </MenubarContent>
            </MenubarMenu>
          );
        })}
      </Menubar>

      {/* Where-am-I breadcrumb — the menus hide the active module name,
          so the bar itself states it: GROUP ▸ MODULE. */}
      {activeModule && activeGroup && (
        <span
          className="ds-settings-menubar-crumb"
          data-testid="v2-settings-active-module"
        >
          <span className="ds-settings-menubar-crumb-group">{activeGroup.label}</span>
          <span aria-hidden className="ds-settings-menubar-crumb-sep">▸</span>
          <span className="ds-settings-menubar-crumb-module">{activeModule.name}</span>
        </span>
      )}
    </div>
  );
}
