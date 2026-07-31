/**
 * CellRendererBand — column-settings band 10.
 *
 * Surfaces a renderer-picker (`Select`, grouped by category) plus
 * the per-renderer config editor for the chosen id. Writes back to
 * the column draft as `cellRendererId` + `cellRendererConfig`
 * (`{ kind, config }` envelope) so the engine transform can emit
 * `cellRenderer` + `cellRendererParams` on the colDef.
 *
 * The Cell Renderer band ships AFTER the Cell Editor band (band
 * 09) and is the last band in the column-settings editor.
 */
import { useCallback, useMemo } from 'react';
import {
  cellRendererCatalogue,
  type CellRendererCategory,
  type CellRendererCatalogueEntry,
  type CellRendererConfig,
  type CellRendererId,
} from '@wellsfargo-starui/design-system';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@wellsfargo-starui/ui';
import { Band } from '../../../ui/SettingsPanel';
import { Row } from './Row';
import { EDITORS_BY_ID } from '../CellRendererEditors';
import type { ColumnAssignment } from '../state';

const CATEGORY_LABELS: Record<CellRendererCategory, string> = {
  'visual-analytics': 'Visual analytics',
  'composite': 'Composite text / icon',
  'fi-specialised': 'FI specialised',
  'existing': 'Built-in (no config)',
};

const NONE_SENTINEL = '__none__';

export interface CellRendererBandProps {
  colId: string;
  cellRendererId: string | undefined;
  cellRendererConfig: unknown | undefined;
  setDraft: (patch: Partial<ColumnAssignment>) => void;
}

export function CellRendererBand({
  colId,
  cellRendererId,
  cellRendererConfig,
  setDraft,
}: CellRendererBandProps) {
  const grouped = useMemo(() => groupCatalogue(cellRendererCatalogue), []);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === NONE_SENTINEL) {
        setDraft({ cellRendererId: undefined, cellRendererConfig: undefined });
        return;
      }
      // Switching renderer always clears the prior config — different
      // renderers have completely different config shapes.
      const wasSameKind = isEnvelope(cellRendererConfig) && cellRendererConfig.kind === id;
      setDraft({
        cellRendererId: id,
        cellRendererConfig: wasSameKind ? cellRendererConfig : undefined,
      });
    },
    [cellRendererConfig, setDraft],
  );

  const currentKind = cellRendererId as CellRendererId | undefined;
  const Editor = currentKind ? EDITORS_BY_ID[currentKind] : undefined;

  const envelopeConfig = isEnvelope(cellRendererConfig) && cellRendererConfig.kind === currentKind
    ? cellRendererConfig.config
    : undefined;

  const handleConfigChange = useCallback(
    (next: unknown) => {
      if (!currentKind) return;
      const envelope: CellRendererConfig = { kind: currentKind, config: next } as CellRendererConfig;
      setDraft({ cellRendererConfig: envelope });
    },
    [currentKind, setDraft],
  );

  return (
    <Band index="10" title="CELL RENDERER">
      <Row
        label="RENDERER"
        hint="Pick a registered cell renderer for this column"
        control={
          <Select value={cellRendererId ?? NONE_SENTINEL} onValueChange={handleSelect}>
            <SelectTrigger
              style={{ minWidth: 220 }}
              data-testid={`cols-${colId}-renderer-trigger`}
            >
              <SelectValue placeholder="None (default)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_SENTINEL}>None (default)</SelectItem>
              {(Object.keys(grouped) as CellRendererCategory[]).map((cat) => (
                <SelectGroup key={cat}>
                  <SelectLabel>{CATEGORY_LABELS[cat]}</SelectLabel>
                  {grouped[cat].map((entry) => (
                    <SelectItem
                      key={entry.id}
                      value={entry.id}
                      data-testid={`cols-${colId}-renderer-option-${entry.id}`}
                    >
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        }
      />
      {Editor && (
        <div style={{ paddingTop: 4 }}>
          <Editor
            value={envelopeConfig as never}
            onChange={handleConfigChange as never}
            testId={`cols-${colId}-renderer-cfg`}
          />
        </div>
      )}
      {currentKind && !Editor && (
        <div style={{ fontSize: 11, opacity: 0.6, padding: 6 }}>
          This renderer has no editable configuration — it paints the cell
          based purely on the value.
        </div>
      )}
    </Band>
  );
}

function groupCatalogue(
  catalogue: ReadonlyArray<CellRendererCatalogueEntry>,
): Record<CellRendererCategory, CellRendererCatalogueEntry[]> {
  const out: Record<CellRendererCategory, CellRendererCatalogueEntry[]> = {
    'visual-analytics': [],
    'composite': [],
    'fi-specialised': [],
    'existing': [],
  };
  for (const entry of catalogue) out[entry.category].push(entry);
  return out;
}

function isEnvelope(v: unknown): v is { kind: string; config: unknown } {
  return Boolean(v && typeof v === 'object' && 'kind' in v && 'config' in v);
}
