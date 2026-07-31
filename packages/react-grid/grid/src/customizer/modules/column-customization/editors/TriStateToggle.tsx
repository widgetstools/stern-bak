import { Select } from '../../../ui/NativeOptionsSelect';

/**
 * Tri-state dropdown (default / on / off). `sortable` / `filterable` /
 * `resizable` are `boolean | undefined` on the assignment — undefined
 * means "inherit host default", true / false are explicit overrides.
 *
 * Previously rendered as a PillToggleGroup, but the 28px fixed pill
 * width truncated / overlapped labels like "DEFAULT". Switched to a
 * shadcn Select for consistency with the Grid Options panel and to keep
 * the three states readable.
 */
export function TriStateToggle({
  value,
  onChange,
  testId,
}: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
  testId?: string;
}) {
  return (
    <Select
      value={value === true ? 'on' : value === false ? 'off' : 'default'}
      onChange={(e) => {
        const v = e.target.value;
        if (v === 'on') return onChange(true);
        if (v === 'off') return onChange(false);
        onChange(undefined);
      }}
      data-testid={testId}
      style={{ maxWidth: 180 }}
    >
      <option value="default">Host default</option>
      <option value="on">On</option>
      <option value="off">Off</option>
    </Select>
  );
}
