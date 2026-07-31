import type { ReactNode } from 'react';
import { cn } from '@wellsfargo-starui/ui';
import { Tooltip } from './HoverTooltip';
import { FormatColorPicker } from './format-editor/FormatColorPicker';
import { ChromeButton } from './ChromeButton';
import { FormatPopover } from './format-editor/FormatPopover';

export interface ColorPickerProps {
  value?: string;
  onChange: (color: string | undefined) => void;
  allowClear?: boolean;
  compact?: boolean;
}

export function ColorPicker({ value, onChange, allowClear = true }: ColorPickerProps) {
  return (
    <div style={{ padding: 8 }} onMouseDown={(e) => {
      if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault();
    }}>
      <FormatColorPicker
        value={value || '#000000'}
        onChange={(c) => onChange(c || undefined)}
        allowClear={allowClear}
      />
    </div>
  );
}

export interface ColorPickerPopoverProps {
  value?: string;
  onChange: (color: string | undefined) => void;
  icon: ReactNode;
  disabled?: boolean;
  allowClear?: boolean;
  compact?: boolean;
  title?: string;
  triggerClassName?: string;
}

export function ColorPickerPopover({
  value,
  onChange,
  icon,
  disabled,
  allowClear = true,
  title = 'Pick a color',
  triggerClassName,
}: ColorPickerPopoverProps) {
  return (
    <FormatPopover
      trigger={
        <Tooltip content={title}>
          <ChromeButton
            type="button"
            disabled={disabled}
            aria-label={title}
            className={cn(
              triggerClassName ?? 'shrink-0 rounded-[4px] ds-tbtn transition-all duration-150 inline-flex items-center justify-center w-7 h-7',
              disabled && 'opacity-25 pointer-events-none',
            )}
          >
            <span className="flex flex-col items-center gap-[1px]">
              {icon}
              <span
                className="w-3.5 h-[2px] rounded-full transition-colors"
                style={{ background: value || 'var(--ds-text-muted)' }}
              />
            </span>
          </ChromeButton>
        </Tooltip>
      }
      width={240}
    >
      {({ close }) => (
        <FormatColorPicker
          value={value || '#000000'}
          onChange={(c) => onChange(c || undefined)}
          allowClear={allowClear}
          onCommit={close}
        />
      )}
    </FormatPopover>
  );
}
