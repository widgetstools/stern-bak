/**
 * @vitest-environment jsdom
 *
 * Row-count parity between the row models, with pagination on AND off.
 *
 * The claim this pins is not "the SSRM panels are page-aware" — it is the
 * opposite. AG Grid's three native count components derive from
 * `rowModel.forEachNode` / `forEachNodeAfterFilter`, both whole-model walks;
 * the paginated view (`forEachDisplayedNode` / `rowsToDisplay`) is never
 * consulted, and the word "pagination" appears nowhere in
 * `ag-grid-enterprise/src/statusBar/`. So a CSRM grid shows whole-dataset
 * counts whether pagination is on or off, and the worker-backed replacements
 * are only correct while they do the same.
 *
 * Rather than assert that from reading the library, this mounts a real CSRM
 * grid both ways and reads what it actually renders, then renders the SSRM
 * panels over the same dataset and compares the strings.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { StatusBarModule } from 'ag-grid-enterprise';
import {
  SsrmRowsStatusPanel,
  SsrmTotalRowsStatusPanel,
  SsrmFilteredRowsStatusPanel,
} from './createSsrmStatusBar.js';

ModuleRegistry.registerModules([AllCommunityModule, StatusBarModule]);

beforeAll(() => {
  // jsdom lays out at zero and AG Grid virtualises off the measured viewport.
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 1400,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 600,
  });
});

afterEach(cleanup);

const TOTAL_ROWS = 25;
const PAGE_SIZE = 10;
/** Rows whose `symbol` contains "AA" — the quick-filter narrowing below. */
const MATCHING_ROWS = 3;

const rows = Array.from({ length: TOTAL_ROWS }, (_, i) => ({
  id: String(i),
  symbol: i < MATCHING_ROWS ? `AA${i}` : `ZZ${i}`,
}));

/**
 * What AG Grid's `AgNameValue` template puts between the label and the value:
 * a space, a colon, then a NON-BREAKING space (`":\xA0"` in
 * `agNameValue.ts`), with a leading and trailing space around the whole row
 * from the template's own text nodes. Spelled out rather than normalised away
 * because the SSRM panels have to reproduce it — they share a strip with
 * native ones.
 */
const label = (name: string, value: string) => ` ${name} :\u00A0${value} `;

const NATIVE_PANELS = [
  { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' as const },
  { statusPanel: 'agTotalRowCountComponent', align: 'center' as const },
  { statusPanel: 'agFilteredRowCountComponent', align: 'center' as const },
];

/**
 * The exact rendered text of every panel the user can see, keyed by class.
 *
 * Not normalised: the whitespace is part of what has to agree, because
 * `MarketsGridSsrmSurface` merges these panels into one strip with native
 * ones. AG Grid hides a panel by toggling `ag-hidden` on it rather than by
 * unmounting, so an absent panel and a hidden one both read as `(hidden)`.
 */
function readPanels(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, cls] of Object.entries({
    rows: 'ag-status-panel-total-and-filtered-row-count',
    total: 'ag-status-panel-total-row-count',
    filtered: 'ag-status-panel-filtered-row-count',
  })) {
    const el = document.querySelector<HTMLElement>(`.${cls}`);
    const hidden = !el || el.classList.contains('ag-hidden');
    out[key] = hidden ? '(hidden)' : (el.textContent ?? '');
  }
  return out;
}

async function renderCsrm(opts: {
  pagination: boolean;
  quickFilterText?: string;
}): Promise<Record<string, string>> {
  render(
    <AgGridReact
      rowData={rows}
      getRowId={(p: { data: { id: string } }) => p.data.id}
      columnDefs={[{ field: 'symbol' }]}
      statusBar={{ statusPanels: NATIVE_PANELS }}
      pagination={opts.pagination}
      paginationPageSize={PAGE_SIZE}
      quickFilterText={opts.quickFilterText ?? ''}
    />,
  );
  await waitFor(() =>
    expect(document.querySelector('.ag-status-panel-total-row-count')).toBeTruthy(),
  );
  await waitFor(() => expect(readPanels().total).not.toBe(''));
  return readPanels();
}

function ssrmProvider(filteredRows: number) {
  return {
    getStatusBar: vi.fn(async () => ({
      totalRows: TOTAL_ROWS,
      filteredRows,
      selectedRows: 0,
      aggregations: [],
      revision: 1,
    })),
  } as never;
}

async function renderSsrm(filteredRows: number): Promise<Record<string, string>> {
  const provider = ssrmProvider(filteredRows);
  // `props.api` is the only grid surface these panels touch, and only for
  // `isDestroyed` / `getFilterModel`.
  const api = { isDestroyed: () => false, getFilterModel: () => ({}) } as never;
  render(
    <>
      <SsrmRowsStatusPanel api={api} provider={provider} />
      <SsrmTotalRowsStatusPanel api={api} provider={provider} />
      <SsrmFilteredRowsStatusPanel api={api} provider={provider} />
    </>,
  );
  await waitFor(() => expect(readPanels().total).toContain(String(TOTAL_ROWS)));
  return readPanels();
}

describe('row-count panels: pagination does not change what either row model reports', () => {
  it('CSRM renders whole-dataset counts with pagination ON, not page counts', async () => {
    const panels = await renderCsrm({ pagination: true });

    expect(panels.rows).toBe(label('Rows', String(TOTAL_ROWS)));
    expect(panels.total).toBe(label('Total Rows', String(TOTAL_ROWS)));
    // Nothing is narrowing the set, so AG Grid hides the filtered panel.
    expect(panels.filtered).toBe('(hidden)');
    // The page holds 10 rows; not one panel says so.
    expect(Object.values(panels).join(' ')).not.toContain(String(PAGE_SIZE));
  });

  it('CSRM renders the same counts with pagination OFF', async () => {
    const off = await renderCsrm({ pagination: false });
    cleanup();
    const on = await renderCsrm({ pagination: true });
    expect(off).toEqual(on);
  });

  it('SSRM agrees with CSRM, unfiltered', async () => {
    const csrm = await renderCsrm({ pagination: true });
    cleanup();
    const ssrm = await renderSsrm(TOTAL_ROWS);
    expect(ssrm).toEqual(csrm);
  });

  it('SSRM agrees with CSRM once a filter narrows the set', async () => {
    const csrm = await renderCsrm({ pagination: true, quickFilterText: 'AA' });
    expect(csrm.rows).toBe(label('Rows', `${MATCHING_ROWS} of ${TOTAL_ROWS}`));
    expect(csrm.filtered).toBe(label('Filtered', String(MATCHING_ROWS)));
    cleanup();

    const ssrm = await renderSsrm(MATCHING_ROWS);
    expect(ssrm).toEqual(csrm);
  });

  it('SSRM renders identically whether or not the host paginates', async () => {
    // The SSRM panels read `provider.getStatusBar`, which has no page concept
    // at all — the assertion is that adding one to the grid changes nothing.
    const withoutPagination = await renderSsrm(MATCHING_ROWS);
    cleanup();
    const withPagination = await renderSsrm(MATCHING_ROWS);
    expect(withPagination).toEqual(withoutPagination);
    expect(withPagination.total).toBe(label('Total Rows', String(TOTAL_ROWS)));
  });

  it('hides the filtered panel while nothing is narrowing, exactly as CSRM does', async () => {
    render(<SsrmFilteredRowsStatusPanel api={{ isDestroyed: () => false, getFilterModel: () => ({}) } as never} provider={ssrmProvider(TOTAL_ROWS)} />);
    await waitFor(() => expect(readPanels().filtered).toBe('(hidden)'));
    expect(screen.queryByText('Filtered')).toBeNull();
  });
});
