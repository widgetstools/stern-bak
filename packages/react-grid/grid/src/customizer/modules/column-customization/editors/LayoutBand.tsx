import { Band, IconInput } from '../../../ui/SettingsPanel';
import { Switch } from '@wellsfargo-starui/ui';
import { Select } from '../../../ui/NativeOptionsSelect';
import { Row } from './Row';
import { TriStateToggle } from './TriStateToggle';
import type { ColumnAssignment } from '../state';

export function LayoutBand({
  colId,
  initialWidth,
  initialPinned,
  initialHide,
  sortable,
  resizable,
  setDraft,
}: {
  colId: string;
  initialWidth: number | undefined;
  initialPinned: ColumnAssignment['initialPinned'];
  initialHide: boolean | undefined;
  sortable: boolean | undefined;
  resizable: boolean | undefined;
  setDraft: (patch: Partial<ColumnAssignment>) => void;
}) {
  return (
    <Band index="02" title="LAYOUT">
      <Row
        label="INITIAL WIDTH"
        hint="Pixels · blank = host default"
        control={
          <IconInput
            value={initialWidth != null ? String(initialWidth) : ''}
            numeric
            suffix="PX"
            onCommit={(raw) => {
              if (!raw.trim()) return setDraft({ initialWidth: undefined });
              const n = Number(raw);
              if (Number.isFinite(n) && n > 0) setDraft({ initialWidth: n });
            }}
            data-testid={`cols-${colId}-width`}
            className="max-w-[160px]"
          />
        }
      />
      <Row
        label="PINNED"
        control={
          <Select
            value={
              initialPinned === 'left'
                ? 'left'
                : initialPinned === 'right'
                  ? 'right'
                  : 'off'
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'left') return setDraft({ initialPinned: 'left' });
              if (v === 'right') return setDraft({ initialPinned: 'right' });
              setDraft({ initialPinned: undefined });
            }}
            data-testid={`cols-${colId}-pinned`}
            style={{ maxWidth: 180 }}
          >
            <option value="off">Off</option>
            <option value="left">Pinned left</option>
            <option value="right">Pinned right</option>
          </Select>
        }
      />
      <Row
        label="INITIAL HIDE"
        hint="Hide the column on first render"
        control={
          <Switch
            checked={initialHide ?? false}
            onCheckedChange={(checked) => setDraft({ initialHide: checked || undefined })}
            data-testid={`cols-${colId}-hide`}
          />
        }
      />
      <Row
        label="SORTABLE"
        control={
          <TriStateToggle
            value={sortable}
            onChange={(v) => setDraft({ sortable: v })}
            testId={`cols-${colId}-sortable`}
          />
        }
      />
      <Row
        label="RESIZABLE"
        control={
          <TriStateToggle
            value={resizable}
            onChange={(v) => setDraft({ resizable: v })}
            testId={`cols-${colId}-resizable`}
          />
        }
      />
    </Band>
  );
}
