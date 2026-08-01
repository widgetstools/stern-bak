import { useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@wellsfargo-starui/react';
import { TextSection } from './sections/TextSection';
import { ColorSection } from './sections/ColorSection';
import { BorderSection } from './sections/BorderSection';
import { FormatSection } from './sections/FormatSection';
import type {
  StyleEditorDataType,
  StyleEditorSection,
  StyleEditorValue,
  StyleEditorVariant,
} from './types';

/**
 * <StyleEditor /> — the one editor every v2 panel uses to set text, color,
 * borders, and value formatter on a grid element (cell, header, group
 * header, or any shape-compatible target).
 *
 *   <StyleEditor
 *     value={draft.style}
 *     onChange={(patch) => setDraft({ style: { ...draft.style, ...patch }})}
 *     sections={['text','color','border','format']}
 *     dataType="number"
 *   />
 *
 * variant:
 *   - 'inline'  (default) — renders bare, lets the parent wrap it.
 *   - 'popover'           — wraps sections in a Popover; parent supplies trigger.
 *   - 'dialog' / 'drawer' — same sections in a bigger surface; we build a
 *                            simple shell using the shadcn Popover anchored
 *                            at center to avoid a new dep.
 *
 * The shared look for every variant is a vertical stack of FigmaPanelSections,
 * so the editor always feels like a sub-panel regardless of container.
 */

export interface StyleEditorProps {
  value: StyleEditorValue;
  onChange: (patch: Partial<StyleEditorValue>) => void;
  sections?: StyleEditorSection[];
  dataType?: StyleEditorDataType;
  variant?: StyleEditorVariant;
  /** Required when variant !== 'inline'. */
  trigger?: ReactNode;
  /** Controlled open state for popover/dialog/drawer. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional width override for popover/dialog variants. */
  width?: number;
  'data-testid'?: string;
}

const DEFAULT_SECTIONS: StyleEditorSection[] = ['text', 'color', 'border', 'format'];

export function StyleEditor({
  value,
  onChange,
  sections = DEFAULT_SECTIONS,
  dataType,
  variant = 'inline',
  trigger,
  open: openProp,
  onOpenChange,
  width,
  ...rest
}: StyleEditorProps) {
  // Uncontrolled fallback for popover/dialog variants when the caller just
  // wants "give me a trigger that toggles it".
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? (openProp as boolean) : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  // Assign sequential indices (02/03/04/05…) based on the section order
  // the caller passes, so section numbering stays continuous whether all
  // four are shown or only a subset.
  let nextIndex = 2;
  const indexFor = () => String(nextIndex++).padStart(2, '0');

  const body = (
    <div
      data-testid={rest['data-testid']}
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      {sections.includes('text') && (
        <TextSection value={value} onChange={onChange} index={indexFor()} />
      )}
      {sections.includes('color') && (
        <ColorSection value={value} onChange={onChange} index={indexFor()} />
      )}
      {sections.includes('border') && (
        <BorderSection value={value} onChange={onChange} index={indexFor()} />
      )}
      {sections.includes('format') && (
        <FormatSection value={value} onChange={onChange} dataType={dataType} index={indexFor()} />
      )}
    </div>
  );

  if (variant === 'inline') {
    return body;
  }

  // For popover / dialog / drawer we reuse the shadcn Popover shell —
  // Radix handles portal + collision detection for free. Dialog/drawer
  // swap to wider content; that's all that differs.
  const popoverWidth =
    width ??
    (variant === 'dialog' ? 380 : variant === 'drawer' ? 320 : 280);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={variant === 'drawer' ? 'end' : 'start'}
        sideOffset={8}
        style={{ width: popoverWidth, padding: 0 }}
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}

export type { StyleEditorValue, StyleEditorSection, StyleEditorVariant, StyleEditorDataType } from './types';
