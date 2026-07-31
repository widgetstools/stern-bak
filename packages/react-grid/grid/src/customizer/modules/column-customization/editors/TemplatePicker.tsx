import { Caps } from '../../../ui/SettingsPanel';
import { Select } from '../../../ui/NativeOptionsSelect';
import type { ColumnTemplate } from '../../column-templates';

/**
 * Compact dropdown for adding a template to a column. Renders an empty-
 * state hint when no templates exist or when every template is already
 * applied.
 */
export function TemplatePicker({
  allTemplates,
  appliedIds,
  onAdd,
  colId,
}: {
  allTemplates: Record<string, ColumnTemplate>;
  appliedIds: string[];
  onAdd: (id: string) => void;
  colId: string;
}) {
  const applied = new Set(appliedIds);
  const available = Object.values(allTemplates).filter((t) => !applied.has(t.id));
  if (available.length === 0) {
    return (
      <Caps size="2xs" color="var(--ds-text-faint)">
        {Object.keys(allTemplates).length === 0
          ? 'No templates exist yet — save one from the Formatting Toolbar.'
          : 'All templates already applied.'}
      </Caps>
    );
  }
  return (
    <Select
      value=""
      onChange={(e) => {
        const v = e.target.value;
        if (v) onAdd(v);
      }}
      data-testid={`cols-${colId}-template-picker`}
      style={{ maxWidth: 280 }}
    >
      <option value="">Add template…</option>
      {available.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </Select>
  );
}
