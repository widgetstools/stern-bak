import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PerspectiveTableFields, type PerspectiveTableCfg } from './PerspectiveTableFields.js';

const base: PerspectiveTableCfg = {
  keyColumn: 'positionId',
  columnDefinitions: [
    { field: 'positionId', headerName: 'Position', cellDataType: 'text' },
    { field: 'quantity', headerName: 'Qty', cellDataType: 'number' },
    { field: 'tradeDate', headerName: 'Trade Date', cellDataType: 'date' },
  ],
};

function renderFields(cfg: PerspectiveTableCfg, onChange = vi.fn()) {
  render(
    <PerspectiveTableFields
      cfg={cfg}
      onChange={onChange}
      providerLabel="positions-live"
      providerId="dp-1"
    />,
  );
  return onChange;
}

describe('PerspectiveTableFields', () => {
  it('edits the table name and round-trips it', async () => {
    const user = userEvent.setup();
    const onChange = renderFields(base);

    await user.type(screen.getByPlaceholderText('dp-1'), 'b');

    expect(onChange).toHaveBeenCalledWith({ tableName: 'b' });
  });

  it('toggles date inference', async () => {
    const user = userEvent.setup();
    const onChange = renderFields(base);

    await user.click(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledWith({ inferDates: false });
  });

  it('edits the build-after-rows backstop, and clears it back to unset', async () => {
    const user = userEvent.setup();
    const onChange = renderFields({ ...base, buildAfterRows: 500 });

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveValue(500);
    await user.clear(input);

    expect(onChange).toHaveBeenCalledWith({ buildAfterRows: undefined });
  });

  // Perspective silently truncates a float that lands in an integer column, so
  // the picker offers only the columns that could legitimately be integers —
  // a free-text field would let a typo name a column that does not exist.
  it('offers only numeric columns as integer columns, and round-trips a pick', async () => {
    const user = userEvent.setup();
    const onChange = renderFields(base);

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByText('quantity')).toBeInTheDocument();
    expect(screen.queryByText('tradeDate')).not.toBeInTheDocument();

    await user.click(screen.getByText('quantity'));
    expect(onChange).toHaveBeenCalledWith({ integerColumns: ['quantity'] });
  });

  it('declares the Table schema from the column definitions', async () => {
    const user = userEvent.setup();
    const onChange = renderFields(base);

    await user.click(screen.getByRole('button', { name: /Declare from columns/i }));

    expect(onChange).toHaveBeenCalledWith({
      inferredFields: [
        { path: 'positionId', type: 'string', nullable: true },
        { path: 'quantity', type: 'number', nullable: true },
        { path: 'tradeDate', type: 'date', nullable: true },
      ],
    });
  });

  it('clears a declared schema', async () => {
    const user = userEvent.setup();
    const onChange = renderFields({
      ...base,
      inferredFields: [{ path: 'positionId', type: 'string', nullable: true }],
    });

    await user.click(screen.getByRole('button', { name: /^Clear$/i }));

    expect(onChange).toHaveBeenCalledWith({ inferredFields: [] });
  });

  it('says the Table opens immediately once fields are declared', () => {
    renderFields({
      ...base,
      inferredFields: [{ path: 'positionId', type: 'string', nullable: true }],
    });

    expect(screen.getByText(/created empty and immediately/i)).toBeInTheDocument();
  });

  it('says the blotter stays empty when nothing is declared', () => {
    renderFields({ keyColumn: 'positionId' });

    expect(screen.getByText(/Nothing declared/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Declare from columns/i })).toBeDisabled();
  });

  // The worker refuses the attach for either of these, naming the columns. The
  // editor has to say so at authoring time or the user only finds out when a
  // blotter shows a refusal — by which point the provider is already saved and
  // silently push-only.
  it('surfaces a composite keyColumn as an error before save, in the worker’s own words', () => {
    renderFields({ ...base, keyColumn: ['book', 'positionId'] });

    const alert = screen.getByTestId('perspective-key-column-error');
    expect(alert).toHaveTextContent(
      "Provider 'positions-live' has a composite keyColumn [book, positionId], "
        + 'which cannot index a Perspective Table.',
    );
  });

  it('surfaces a missing keyColumn as an error before save', () => {
    renderFields({ ...base, keyColumn: undefined });

    expect(screen.getByTestId('perspective-key-column-error')).toHaveTextContent(
      "Provider 'positions-live' has no keyColumn, which a Perspective Table needs to index on.",
    );
  });

  it('shows no key-column error for a single scalar key', () => {
    renderFields(base);

    expect(screen.queryByTestId('perspective-key-column-error')).toBeNull();
  });
});
