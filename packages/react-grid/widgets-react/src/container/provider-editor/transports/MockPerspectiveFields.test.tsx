import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MockPerspectiveProviderConfig } from '@wellsfargo-starui/types/shared';
import { MockPerspectiveFields } from './MockPerspectiveFields.js';

const base: MockPerspectiveProviderConfig = {
  providerType: 'mock-perspective',
  dataType: 'positions',
  rowCount: 50,
  updateIntervalMs: 2000,
  enableUpdates: true,
  rowShape: 'flat',
  keyColumn: 'positionId',
  columnDefinitions: [{ field: 'positionId', headerName: 'Position', cellDataType: 'text' }],
};

function renderFields(cfg: MockPerspectiveProviderConfig = base, onChange = vi.fn()) {
  render(
    <MockPerspectiveFields
      cfg={cfg}
      onChange={onChange}
      providerLabel="mock-book"
      providerId="dp-mock"
    />,
  );
  return onChange;
}

const flattenSwitch = () =>
  screen.getByRole('switch', { name: /Flatten rows before they reach the Table/i });

describe('MockPerspectiveFields', () => {
  it('still edits every Mock setting', async () => {
    const user = userEvent.setup();
    const onChange = renderFields();

    const [rowCount] = screen.getAllByRole('spinbutton');
    await user.clear(rowCount!);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rowCount: expect.any(Number) }));

    onChange.mockClear();
    await user.click(screen.getByRole('switch', { name: /Tick rows after the snapshot/i }));
    expect(onChange).toHaveBeenCalledWith({ enableUpdates: false });
  });

  it('edits the Table settings alongside them', async () => {
    const user = userEvent.setup();
    const onChange = renderFields();

    await user.type(screen.getByPlaceholderText('dp-mock'), 'p');

    expect(onChange).toHaveBeenCalledWith({ tableName: 'p' });
  });

  // The row shape is shown rather than left to the transport default: a saved
  // config that never records it is a config that never decided it.
  it('round-trips the row shape', async () => {
    const user = userEvent.setup();
    const onChange = renderFields();

    const flatten = flattenSwitch();
    expect(flatten).toHaveAttribute('data-state', 'checked');
    await user.click(flatten);

    expect(onChange).toHaveBeenCalledWith({ rowShape: 'nested' });
  });

  it('defaults the row-shape switch to flat when the config never set it', () => {
    renderFields({ ...base, rowShape: undefined });

    expect(flattenSwitch()).toHaveAttribute('data-state', 'checked');
  });

  it('warns that nested rows cannot populate a Table', () => {
    renderFields({ ...base, rowShape: 'nested' });

    expect(screen.getByTestId('mock-perspective-nested-warning')).toHaveTextContent(
      /cannot populate a Perspective Table/i,
    );
  });

  it('warns that flattening has nothing to lift without column definitions', () => {
    renderFields({ ...base, columnDefinitions: [] });

    expect(screen.getByTestId('mock-perspective-no-columns-warning')).toHaveTextContent(
      /no paths to lift/i,
    );
  });

  it('surfaces an unusable keyColumn before save', () => {
    renderFields({ ...base, keyColumn: undefined });

    expect(screen.getByTestId('perspective-key-column-error')).toHaveTextContent(
      "Provider 'mock-book' has no keyColumn, which a Perspective Table needs to index on.",
    );
  });
});
