import { Band, IconInput } from '../../../ui/SettingsPanel';
import { Row } from './Row';

/**
 * Read-only display of the immutable column id. Styled to match
 * `IconInput`'s height + border so it sits next to its editable
 * siblings in the band without looking out of place, but the
 * `cursor-default` + non-input markup signal "you can read but not
 * change this".
 */
function ColIdReadOnlyField({ colId }: { colId: string }) {
  return (
    <div
      data-testid={`cols-${colId}-col-id`}
      title={`Column id · ${colId}`}
      className="inline-flex items-center h-7 px-2 rounded-sm border border-border bg-muted/30 font-mono tabular-nums text-foreground/85 select-text cursor-default max-w-[260px] min-w-0 text-[12px]"
    >
      <span className="truncate">{colId}</span>
    </div>
  );
}

export function HeaderBand({
  colId,
  hostHeaderName,
  headerName,
  headerTooltip,
  setDraft,
}: {
  colId: string;
  hostHeaderName: string;
  headerName: string | undefined;
  headerTooltip: string | undefined;
  setDraft: (patch: { headerName?: string; headerTooltip?: string }) => void;
}) {
  return (
    <Band index="01" title="HEADER">
      <Row
        label="COL ID"
        hint="Read-only · column identifier"
        control={<ColIdReadOnlyField colId={colId} />}
      />
      <Row
        label="HEADER NAME"
        hint="Blank = use the host-supplied header"
        control={
          <IconInput
            value={headerName ?? ''}
            onCommit={(v) => setDraft({ headerName: v.trim() ? v : undefined })}
            placeholder={hostHeaderName}
            data-testid={`cols-${colId}-header-name`}
            className="max-w-[260px]"
          />
        }
      />
      <Row
        label="TOOLTIP"
        control={
          <IconInput
            value={headerTooltip ?? ''}
            onCommit={(v) => setDraft({ headerTooltip: v.trim() ? v : undefined })}
            data-testid={`cols-${colId}-header-tooltip`}
            className="max-w-[320px]"
          />
        }
      />
    </Band>
  );
}
