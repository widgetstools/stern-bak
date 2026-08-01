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

interface ModuleGroupDef {
  id: string;
  label: string;
  moduleIds: readonly string[];
}

/**
 * Category map. Order here is display order — both of the menus in the
 * bar and of the items inside each menu.
 */
const MODULE_GROUP_DEFS: readonly ModuleGroupDef[] = [
  {
    id: 'options',
    label: 'Options',
    moduleIds: [
      'general-settings',
      'toolbar-visibility',
      'toolbar-date-settings',
      'grid-state',
      'shortcuts',
    ],
  },
  {
    id: 'columns',
    label: 'Columns',
    moduleIds: [
      'column-customization',
      'column-groups',
      'calculated-columns',
      'column-templates',
    ],
  },
  {
    id: 'styling',
    label: 'Styling',
    moduleIds: ['conditional-styling', 'alerts'],
  },
  {
    id: 'editing',
    label: 'Editing',
    moduleIds: ['smart-edit', 'bulk-update', 'plus-minus', 'data-change-history'],
  },
  {
    id: 'data',
    label: 'Data',
    moduleIds: ['saved-filters', 'visual-excel'],
  },
];

/** Catch-all menu for module ids missing from the category map. */
const FALLBACK_GROUP = { id: 'more', label: 'More' } as const;

export interface ModuleMenubarGroup {
  id: string;
  label: string;
  modules: AnyModule[];
}

/**
 * Buckets `modules` into the declared categories (declaration order, empty
 * categories dropped) with unknown module ids collected into a trailing
 * MORE group in their original registration order.
 */
export function groupModulesForMenubar(modules: AnyModule[]): ModuleMenubarGroup[] {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const claimed = new Set<string>();

  const groups: ModuleMenubarGroup[] = [];
  for (const def of MODULE_GROUP_DEFS) {
    const members: AnyModule[] = [];
    for (const id of def.moduleIds) {
      const mod = byId.get(id);
      if (mod) {
        members.push(mod);
        claimed.add(id);
      }
    }
    if (members.length > 0) {
      groups.push({ id: def.id, label: def.label, modules: members });
    }
  }

  const leftovers = modules.filter((m) => !claimed.has(m.id));
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
