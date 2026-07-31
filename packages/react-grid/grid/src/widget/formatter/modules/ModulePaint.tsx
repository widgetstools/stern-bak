/**
 * 03 · PAINT — text colour, fill colour, borders.
 */
import { useState } from 'react';
import { PaintBucket, SquareDashed, Type } from 'lucide-react';
import {
  BorderStyleEditor,
  ColorPickerPopover,
  Popover as RadixPopover,
  PopoverContent as RadixPopoverContent,
  PopoverTrigger as RadixPopoverTrigger,
  Tooltip,
} from '../../../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { Hair, Module, PillButton, pillClasses } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

export function ModulePaint({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  const { fmt, disabled, isHeader } = state;
  const [borderOpen, setBorderOpen] = useState(false);
  const colorDisabled = isHeader ? false : disabled;

  return (
    <Module index="03" label="Paint">
      <ColorPickerPopover
        disabled={colorDisabled}
        value={fmt.color}
        icon={<Type size={13} strokeWidth={2.25} />}
        onChange={(c) => actions.setTextColor(c)}
        compact
        title="Text color"
        triggerClassName={pillClasses()}
      />
      <ColorPickerPopover
        disabled={disabled}
        value={fmt.background}
        icon={<PaintBucket size={13} strokeWidth={1.75} />}
        onChange={(c) => actions.setBgColor(c)}
        compact
        title="Fill color"
        triggerClassName={pillClasses()}
      />

      <Hair />

      <RadixPopover open={borderOpen} onOpenChange={setBorderOpen}>
        <RadixPopoverTrigger asChild>
          <Tooltip content="Cell borders — set per-edge style, width, and colour">
            <PillButton
              type="button"
              disabled={disabled}
              aria-label="Cell borders"
              className={pillClasses()}
              onMouseDown={(e) => { e.preventDefault(); }}
            >
              <SquareDashed size={13} strokeWidth={1.75} />
            </PillButton>
          </Tooltip>
        </RadixPopoverTrigger>
        <RadixPopoverContent
          align="start"
          sideOffset={6}
          className="ds-sheet-v2"
          style={{
            padding: 0,
            width: 460,
            maxWidth: '90vw',
            background: 'transparent',
            border: 'none',
            borderRadius: 2,
            boxShadow: 'var(--ds-elevation-overlay)',
            fontFamily: 'var(--ds-font-sans)',
          }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName;
            if (tag !== 'SELECT' && tag !== 'INPUT') e.preventDefault();
          }}
        >
          <BorderStyleEditor value={fmt.borders} onChange={actions.applyBordersMap} />
        </RadixPopoverContent>
      </RadixPopover>
    </Module>
  );
}
