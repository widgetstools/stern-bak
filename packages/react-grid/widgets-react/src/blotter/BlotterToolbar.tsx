import React from 'react';
import type { LayoutInfo } from '@wellsfargo-starui/types/shared';
import type { WidgetContext } from '@wellsfargo-starui/react/widget-sdk';
import type { ToolbarButton } from './types.js';
import { LayoutSelector } from './LayoutSelector.js';
import { Button } from '@wellsfargo-starui/react';

export interface BlotterToolbarProps {
  widget: WidgetContext;
  layouts: LayoutInfo[];
  activeLayoutId: string | null;
  onSelectLayout: (layoutId: string) => void;
  onSaveLayout: () => void;
  customButtons?: ToolbarButton[];
  onCustomAction?: (actionId: string) => void;
  onOpenSettings?: () => void;
}

/**
 * BlotterToolbar — top toolbar with layout selector, custom buttons, and settings.
 */
export const BlotterToolbar: React.FC<BlotterToolbarProps> = ({
  widget,
  layouts,
  activeLayoutId,
  onSelectLayout,
  onSaveLayout,
  customButtons = [],
  onCustomAction,
  onOpenSettings,
}) => {
  return (
    <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-card">
      {/* Left: Layout selector */}
      <div className="flex items-center gap-2">
        <LayoutSelector
          layouts={layouts}
          activeLayoutId={activeLayoutId}
          onSelect={onSelectLayout}
          onSave={onSaveLayout}
        />
      </div>

      {/* Center: Custom buttons */}
      <div className="flex items-center gap-1">
        {customButtons.map((btn) => (
          <Button
            key={btn.id}
            variant={(btn.variant as any) || 'ghost'}
            size="sm"
            onClick={() => onCustomAction?.(btn.actionId || btn.id)}
            className="h-7 text-xs"
          >
            {btn.label}
          </Button>
        ))}
      </div>

      {/* Right: Status + Settings */}
      <div className="flex items-center gap-2">
        {widget.isLoading && (
          <span className="text-xs text-muted-foreground">Loading...</span>
        )}
        {onOpenSettings && (
          <Button variant="ghost" size="sm" onClick={onOpenSettings} className="h-7 text-xs">
            Settings
          </Button>
        )}
      </div>
    </div>
  );
};
