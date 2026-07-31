/**
 * 02 · TYPE — typography (B/I/U) + alignment + size.
 *
 * Same content in both surfaces; the parent shell's flex direction
 * + gap tokens handle horizontal vs vertical packing.
 */
import {
  AlignCenter, AlignLeft, AlignRight,
  Bold, Italic, Underline,
} from 'lucide-react';
import { Hair, Module, Pill, ToolbarSelect } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

const FONT_SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24];

export function ModuleType({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  const { fmt, disabled, isHeader } = state;
  const controlDisabled = isHeader ? false : disabled;
  const fontSizeValue = fmt.fontSize != null ? String(fmt.fontSize) : '11';

  return (
    <Module index="02" label="Type">
      {/* B / I / U */}
      <Pill disabled={disabled} tooltip="Bold" active={fmt.bold} onClick={actions.toggleBold}>
        <Bold size={13} strokeWidth={2.25} />
      </Pill>
      <Pill disabled={disabled} tooltip="Italic" active={fmt.italic} onClick={actions.toggleItalic}>
        <Italic size={13} strokeWidth={1.75} />
      </Pill>
      <Pill disabled={disabled} tooltip="Underline" active={fmt.underline} onClick={actions.toggleUnderline}>
        <Underline size={13} strokeWidth={1.75} />
      </Pill>

      <Hair />

      {/* Align L/C/R */}
      <Pill disabled={disabled} tooltip="Align left" active={fmt.horizontal === 'left'} onClick={() => actions.toggleAlign('left')}>
        <AlignLeft size={13} strokeWidth={1.75} />
      </Pill>
      <Pill disabled={disabled} tooltip="Align center" active={fmt.horizontal === 'center'} onClick={() => actions.toggleAlign('center')}>
        <AlignCenter size={13} strokeWidth={1.75} />
      </Pill>
      <Pill disabled={disabled} tooltip="Align right" active={fmt.horizontal === 'right'} onClick={() => actions.toggleAlign('right')}>
        <AlignRight size={13} strokeWidth={1.75} />
      </Pill>

      <Hair />

      <ToolbarSelect
        value={fontSizeValue}
        onValueChange={(next) => {
          if (next) actions.setFontSizePx(Number(next));
        }}
        disabled={controlDisabled}
        tooltip="Font size in pixels"
        aria-label="Font size"
        data-testid="fmt-panel-font-size"
        options={FONT_SIZES.map((sz) => ({
          value: String(sz),
          label: `${sz}px`,
        }))}
      />
    </Module>
  );
}
