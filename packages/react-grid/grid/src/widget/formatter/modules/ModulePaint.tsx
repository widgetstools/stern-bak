/**
 * 03 · PAINT — text colour, fill colour, borders.
 *
 * Decomposed into exported clusters (colors, borders) so the horizontal
 * toolbar can place colours inside its FONT segment and give borders a
 * labeled dropdown trigger, while the vertical panel keeps the whole
 * module. Same state/actions everywhere — behaviour cannot drift.
 */
import { useState } from 'react';
import { ChevronDown, PaintBucket, SquareDashed, Type } from 'lucide-react';
import {
  BorderStyleEditor,
  ColorPickerPopover,
  Popover as RadixPopover,
  PopoverContent as RadixPopoverContent,
  PopoverTrigger as RadixPopoverTrigger,
  Tooltip,
} from '../../../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { Hair, Module, PillButton, pillClasses } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

export interface ClusterProps {
  state: FormatterState;
  actions: FormatterActions;
}

/** Text-colour + fill-colour picker pills. */
export function ColorCluster({ state, actions }: ClusterProps) {
  const { fmt, disabled, isHeader } = state;
  const colorDisabled = isHeader ? false : disabled;
  return (
    <>
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
    </>
  );
}

/**
 * Cell-borders popover. `labeled` renders the toolbar's text trigger
 * ("Borders ⌄"); default is the icon-only pill used by the panel.
 */
export function BordersControl({
  state,
  actions,
  labeled,
}: ClusterProps & { labeled?: boolean }) {
  const { fmt, disabled } = state;
  const [borderOpen, setBorderOpen] = useState(false);

  return (
    <RadixPopover open={borderOpen} onOpenChange={setBorderOpen}>
      <RadixPopoverTrigger asChild>
        <Tooltip content="Cell borders — set per-edge style, width, and colour">
          <PillButton
            type="button"
            disabled={disabled}
            aria-label="Cell borders"
            className={pillClasses(labeled ? 'text' : 'icon')}
            data-testid="fmt-borders-trigger"
            onMouseDown={(e) => { e.preventDefault(); }}
          >
            <SquareDashed size={13} strokeWidth={1.75} />
            {labeled && <span className="fx-trigger-lbl">Borders</span>}
            {labeled && <ChevronDown size={9} strokeWidth={2} />}
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
  );
}

export function ModulePaint({ state, actions }: ClusterProps) {
  return (
    <Module index="03" label="Paint">
      <ColorCluster state={state} actions={actions} />
      <Hair />
      <BordersControl state={state} actions={actions} />
    </Module>
  );
}
