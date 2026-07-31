import {
  CircleDot,
  EyeOff,
  Filter as FilterIcon,
  Layers,
  Pin,
  Sliders,
  Type,
} from 'lucide-react';
import { SummaryChip, type SummaryChipTone } from '../../../ui/SettingsPanel';
import type { ColumnAssignment } from '../state';

/**
 * Sticky info strip pinned under the column editor header.
 *
 * Replaces the legacy 4-column meta grid with the same chip-strip
 * vocabulary the Grid Options panel uses (`SummaryChip` from the
 * SettingsPanel barrel). Four fixed chips always render —
 *
 *   TYPE · DIRTY · OVERRIDES · TEMPLATES
 *
 * — plus conditional chips that surface column-level state at a glance:
 *
 *   PINNED · HIDDEN · FILTER
 *
 * The COL ID lives in the editor header (`ColumnEditorHeader`) as a
 * read-only pill next to the editable header-name input — that's the
 * column's identity, the strip below tracks its mutable state.
 *
 * All tone colours route through the design-system overlay tokens
 * (`--ds-overlay-{warning,info,positive}-soft|-ring`) so dark/light
 * parity is automatic.
 */
export interface ColumnMetaStripProps {
  colId: string;
  cellDataType: string | undefined;
  overrideCount: number;
  templateCount: number;
  /** Unsaved-changes indicator (mirrors the SAVE button enabled state). */
  dirty: boolean;
  /** Current draft — used to surface conditional chips for pinned /
   *  hidden / filter set without dragging the band sub-editors in. */
  draft: ColumnAssignment;
}

function pinnedLabel(p: ColumnAssignment['initialPinned']): string | null {
  if (p === 'left') return 'LEFT';
  if (p === 'right') return 'RIGHT';
  if (p === true) return 'ON';
  return null;
}

const FILTER_SHORT_NAME: Record<string, string> = {
  agTextColumnFilter: 'TEXT',
  agNumberColumnFilter: 'NUMBER',
  agDateColumnFilter: 'DATE',
  agSetColumnFilter: 'SET',
  agMultiColumnFilter: 'MULTI',
  streamSafeMultiColumnFilter: 'STREAM TEXT',
  streamSafeMultiNumberColumnFilter: 'STREAM NUM',
};

function filterChip(
  filter: ColumnAssignment['filter'],
): { label: string; tone: SummaryChipTone } | null {
  if (!filter) return null;
  if (filter.enabled === false) {
    return { label: 'OFF', tone: 'neutral' };
  }
  const kind = filter.kind;
  if (kind && FILTER_SHORT_NAME[kind]) {
    return { label: FILTER_SHORT_NAME[kind], tone: 'info' };
  }
  if (filter.floatingFilter || filter.kind || filter.buttons?.length) {
    return { label: 'CUSTOM', tone: 'info' };
  }
  return null;
}

export function ColumnMetaStrip({
  colId,
  cellDataType,
  overrideCount,
  templateCount,
  dirty,
  draft,
}: ColumnMetaStripProps) {
  const dirtyTone: SummaryChipTone = dirty ? 'warning' : 'neutral';
  const overridesTone: SummaryChipTone =
    overrideCount > 0 ? 'warning' : 'neutral';
  const templatesTone: SummaryChipTone =
    templateCount > 0 ? 'positive' : 'neutral';

  const pinned = pinnedLabel(draft.initialPinned);
  const hidden = draft.initialHide === true;
  const filter = filterChip(draft.filter);

  return (
    <div
      data-testid={`cols-meta-${colId}`}
      className="shrink-0 bg-card border-b border-border px-4 py-2 flex items-center gap-2 flex-wrap"
    >
      <SummaryChip
        icon={<Type size={11} strokeWidth={2} />}
        label="TYPE"
        value={cellDataType ? cellDataType.toUpperCase() : '—'}
        tone={cellDataType ? 'info' : 'neutral'}
        title={
          cellDataType
            ? `Inferred cell data type: ${cellDataType}`
            : 'No cell data type detected'
        }
      />
      <SummaryChip
        icon={<CircleDot size={11} strokeWidth={2} />}
        label="DIRTY"
        value={dirty ? 'YES' : '—'}
        tone={dirtyTone}
        title={dirty ? 'Unsaved changes' : 'No pending changes'}
        data-testid={`cols-meta-dirty-${colId}`}
      />
      <SummaryChip
        icon={<Sliders size={11} strokeWidth={2} />}
        label="OVERRIDES"
        value={overrideCount}
        tone={overridesTone}
        title={`${overrideCount} field${overrideCount === 1 ? '' : 's'} overridden on this column`}
        data-testid={`cols-meta-overrides-${colId}`}
      />
      <SummaryChip
        icon={<Layers size={11} strokeWidth={2} />}
        label="TEMPLATES"
        value={templateCount}
        tone={templatesTone}
        title={`${templateCount} column template${templateCount === 1 ? '' : 's'} applied`}
        data-testid={`cols-meta-templates-${colId}`}
      />
      {pinned && (
        <SummaryChip
          icon={<Pin size={11} strokeWidth={2} />}
          label="PINNED"
          value={pinned}
          tone="primary"
          title={`Pinned ${pinned.toLowerCase()}`}
          data-testid={`cols-meta-pinned-${colId}`}
        />
      )}
      {hidden && (
        <SummaryChip
          icon={<EyeOff size={11} strokeWidth={2} />}
          label="HIDDEN"
          tone="warning"
          title="Column starts hidden on next mount"
          data-testid={`cols-meta-hidden-${colId}`}
        />
      )}
      {filter && (
        <SummaryChip
          icon={<FilterIcon size={11} strokeWidth={2} />}
          label="FILTER"
          value={filter.label}
          tone={filter.tone}
          title={`Filter: ${filter.label.toLowerCase()}`}
          data-testid={`cols-meta-filter-${colId}`}
        />
      )}
    </div>
  );
}
