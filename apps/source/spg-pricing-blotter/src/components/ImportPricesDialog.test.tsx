import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { lookupPositions } = vi.hoisted(() => ({ lookupPositions: vi.fn() }));
vi.mock('../trading/api', () => ({ lookupPositions }));

import { ImportPricesDialog } from './ImportPricesDialog';

/** A File whose `.text()` works under jsdom without a FileReader shim. */
function csvFile(body: string, name = 'marks.csv'): File {
  const file = new File([body], name, { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => body });
  return file;
}

async function pickFile(file: File) {
  const input = screen.getByTestId('spg-import-file') as HTMLInputElement;
  await userEvent.upload(input, file);
}

const server = (found: Array<{ cusip: string; price: number }>, missing: string[] = []) =>
  lookupPositions.mockResolvedValue({
    found: found.map((r) => ({ ...r, priorPrice: r.price })),
    missing,
  });

beforeEach(() => { lookupPositions.mockReset(); });
afterEach(cleanup);

type StageRows = Array<{ cusip: string; fields: Record<string, unknown> }>;

function open(
  onStage: (rows: StageRows) => Promise<void> = vi.fn(async () => {}),
  onOpenChange = vi.fn(),
) {
  render(<ImportPricesDialog open onOpenChange={onOpenChange} onStage={onStage} />);
  return { onStage, onOpenChange };
}

describe('ImportPricesDialog', () => {
  it('offers nothing to stage before a file is chosen', () => {
    open();
    expect(screen.getByTestId('spg-import-apply')).toBeDisabled();
    expect(screen.queryByTestId('spg-import-preview')).toBeNull();
  });

  /**
   * Validation happens against the SERVER before anything touches the grid.
   * The engine upserts whole rows, so a cusip it does not know would be
   * created as a phantom position rather than rejected.
   */
  it('previews old → new only for cusips the server knows', async () => {
    server([{ cusip: 'C1', price: 100 }], ['NOPE']);
    open();

    await pickFile(csvFile('C1,101.5\nNOPE,50\n'));

    const preview = await screen.findByTestId('spg-import-preview');
    expect(lookupPositions).toHaveBeenCalledWith(['C1', 'NOPE']);
    expect(preview).toHaveTextContent('1 to stage');
    expect(preview).toHaveTextContent('1 unknown cusip');
    expect(preview).toHaveTextContent('100.000');
    expect(preview).toHaveTextContent('101.500');
    expect(screen.getByText(/Not on the server/)).toHaveTextContent('NOPE');
  });

  it('counts a line that matches the server price as unchanged, not as a write', () => {
    server([{ cusip: 'C1', price: 100 }]);
    open();

    return pickFile(csvFile('C1,100\n')).then(async () => {
      const preview = await screen.findByTestId('spg-import-preview');
      expect(preview).toHaveTextContent('0 to stage');
      expect(preview).toHaveTextContent('1 unchanged');
      expect(screen.getByTestId('spg-import-apply')).toBeDisabled();
    });
  });

  it('surfaces bad lines rather than dropping them silently', async () => {
    server([{ cusip: 'C1', price: 100 }]);
    open();

    await pickFile(csvFile('C1,101.5\nnot-a-row\n'));

    const preview = await screen.findByTestId('spg-import-preview');
    expect(preview).toHaveTextContent('1 bad line');
    expect(screen.getByText(/^line 2:/)).toBeInTheDocument();
  });

  it('shows an empty preview, and never calls the server, for a file with no usable rows', async () => {
    open();

    await pickFile(csvFile('\n\n'));

    const preview = await screen.findByTestId('spg-import-preview');
    expect(preview).toHaveTextContent('0 to stage');
    expect(lookupPositions).not.toHaveBeenCalled();
  });

  it('reports a failed lookup instead of a half-built preview', async () => {
    lookupPositions.mockRejectedValue(new Error('server offline'));
    open();

    await pickFile(csvFile('C1,101.5\n'));

    expect(await screen.findByText('server offline')).toBeInTheDocument();
    expect(screen.queryByTestId('spg-import-preview')).toBeNull();
  });

  it('stages the matched rows, then closes', async () => {
    server([{ cusip: 'C1', price: 100 }, { cusip: 'C2', price: 50 }]);
    const { onStage, onOpenChange } = open();

    await pickFile(csvFile('C1,101.5\nC2,50.25\n'));
    await screen.findByTestId('spg-import-preview');
    await userEvent.click(screen.getByTestId('spg-import-apply'));

    await waitFor(() => expect(onStage).toHaveBeenCalledWith([
      { cusip: 'C1', fields: { price: 101.5 } },
      { cusip: 'C2', fields: { price: 50.25 } },
    ]));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the dialog open and says why when staging fails', async () => {
    server([{ cusip: 'C1', price: 100 }]);
    const onStage = vi.fn(async () => { throw new Error('engine busy'); });
    const { onOpenChange } = open(onStage);

    await pickFile(csvFile('C1,101.5\n'));
    await screen.findByTestId('spg-import-preview');
    await userEvent.click(screen.getByTestId('spg-import-apply'));

    expect(await screen.findByText('engine busy')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('forgets the previous file when cancelled', async () => {
    server([{ cusip: 'C1', price: 100 }]);
    const { onOpenChange } = open();

    await pickFile(csvFile('C1,101.5\n'));
    await screen.findByTestId('spg-import-preview');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    // A stale preview left behind would let the next open stage prices from
    // a file the trader already dismissed.
    expect(screen.queryByTestId('spg-import-preview')).toBeNull();
    expect(screen.getByTestId('spg-import-pick')).toHaveTextContent('Choose price file…');
  });

  it('opens the file picker from the visible button', async () => {
    open();
    const input = screen.getByTestId('spg-import-file');
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});

    await userEvent.click(screen.getByTestId('spg-import-pick'));

    expect(click).toHaveBeenCalled();
  });

  it('truncates a very large preview but still stages every row', async () => {
    const rows = Array.from({ length: 205 }, (_, i) => ({ cusip: `C${i}`, price: 100 }));
    server(rows);
    const { onStage } = open();

    await pickFile(csvFile(rows.map((r) => `${r.cusip},101`).join('\n')));
    const preview = await screen.findByTestId('spg-import-preview');

    expect(preview).toHaveTextContent('205 to stage');
    expect(preview).toHaveTextContent('…and 5 more.');
    expect(preview.querySelectorAll('tbody tr')).toHaveLength(200);

    await userEvent.click(screen.getByTestId('spg-import-apply'));
    await waitFor(() => expect(vi.mocked(onStage).mock.calls[0][0]).toHaveLength(205));
  });
});
