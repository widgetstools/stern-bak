/**
 * 02 · TYPE — typography (B/I/U) + alignment + size.
 *
 * Decomposed into exported clusters so the horizontal toolbar can
 * arrange them independently (FONT vs ALIGN segments) while the
 * vertical panel keeps composing the whole module. Clusters and module
 * consume the same state/actions — behaviour cannot drift.
 */
import {
  AlignCenter, AlignLeft, AlignRight,
  Bold, Italic, Underline,
} from 'lucide-react';
import { Hair, Module, Pill, ToolbarSelect } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

const FONT_SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24];

export interface ClusterProps {
  state: FormatterState;
  actions: FormatterActions;
}

/** B / I / U emphasis pills. */
export function TypeEmphasisCluster({ state, actions }: ClusterProps) {
  const { fmt, disabled } = state;
  return (
    <>
      <Pill disabled={disabled} tooltip="Bold" active={fmt.bold} onClick={actions.toggleBold}>
        <Bold size={13} strokeWidth={2.25} />
      </Pill>
      <Pill disabled={disabled} tooltip="Italic" active={fmt.italic} onClick={actions.toggleItalic}>
        <Italic size={13} strokeWidth={1.75} />
      </Pill>
      <Pill disabled={disabled} tooltip="Underline" active={fmt.underline} onClick={actions.toggleUnderline}>
        <Underline size={13} strokeWidth={1.75} />
      </Pill>
    </>
  );
}

/** Align left / center / right pills. */
export function AlignCluster({ state, actions }: ClusterProps) {
  const { fmt, disabled } = state;
  return (
    <>
      <Pill disabled={disabled} tooltip="Align left" active={fmt.horizontal === 'left'} onClick={() => actions.toggleAlign('left')}>
        <AlignLeft size={13} strokeWidth={1.75} />
      </Pill>
      <Pill disabled={disabled} tooltip="Align center" active={fmt.horizontal === 'center'} onClick={() => actions.toggleAlign('center')}>
        <AlignCenter size={13} strokeWidth={1.75} />
      </Pill>
      <Pill disabled={disabled} tooltip="Align right" active={fmt.horizontal === 'right'} onClick={() => actions.toggleAlign('right')}>
        <AlignRight size={13} strokeWidth={1.75} />
      </Pill>
    </>
  );
}

/** Font-size select (px). */
export function FontSizeSelect({ state, actions }: ClusterProps) {
  const { fmt, disabled, isHeader } = state;
  const controlDisabled = isHeader ? false : disabled;
  const fontSizeValue = fmt.fontSize != null ? String(fmt.fontSize) : '11';
  return (
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
  );
}

export function ModuleType({ state, actions }: ClusterProps) {
  return (
    <Module index="02" label="Type">
      <TypeEmphasisCluster state={state} actions={actions} />
      <Hair />
      <AlignCluster state={state} actions={actions} />
      <Hair />
      <FontSizeSelect state={state} actions={actions} />
    </Module>
  );
}
