import React from 'react';
import type { LayoutInfo } from '@wellsfargo-starui/shared-types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@wellsfargo-starui/ui';

export interface LayoutSelectorProps {
  layouts: LayoutInfo[];
  activeLayoutId: string | null;
  onSelect: (layoutId: string) => void;
  onSave: () => void;
}

/**
 * LayoutSelector — dropdown to select, save, and manage layouts.
 */
export const LayoutSelector: React.FC<LayoutSelectorProps> = ({
  layouts,
  activeLayoutId,
  onSelect,
  onSave,
}) => {
  return (
    <div className="flex items-center gap-2">
      <Select value={activeLayoutId || ''} onValueChange={onSelect}>
        <SelectTrigger className="w-[180px] h-7 text-xs">
          <SelectValue placeholder="Select layout..." />
        </SelectTrigger>
        <SelectContent>
          {layouts.map((layout) => (
            <SelectItem key={layout.id} value={layout.id}>
              {layout.name}
              {layout.isDefault && ' (default)'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        onClick={onSave}
        className="h-7 px-2 text-xs rounded border border-border hover:bg-accent"
        title="Save current layout"
      >
        Save
      </button>
    </div>
  );
};
