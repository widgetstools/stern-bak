import {
  type DockManagerState, type LayoutNode, type PanelConfig, type Placement,
  findTabGroupForPanel, collectAllPanelsOrdered,
} from '@widgetstools/dock-manager-core';

export function p(id: string, title: string, widgetType: string, closable = false): PanelConfig {
  return { id, title, widgetType, closable };
}

export function tg(id: string, panels: string[], active?: string): LayoutNode {
  return { type: 'tabgroup', id, panels, activePanel: active ?? panels[0] };
}

export function sp(id: string, direction: 'horizontal' | 'vertical', sizes: number[], children: LayoutNode[]): LayoutNode {
  return { type: 'split', id, direction, children, sizes };
}

/** Assemble a DockManagerState: docked placement for every panel in the layout. */
export function base(layout: LayoutNode, panels: Record<string, PanelConfig>, active: string): DockManagerState {
  const placements = new Map<string, Placement>();
  for (const panelId of collectAllPanelsOrdered(layout)) {
    const groupId = findTabGroupForPanel(layout, panelId);
    if (groupId) placements.set(panelId, { type: 'docked', groupId });
  }
  return { layout, panels: new Map(Object.entries(panels)), placements, activePaneId: active, nextZIndex: 100 };
}
