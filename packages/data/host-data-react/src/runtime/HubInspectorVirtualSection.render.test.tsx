import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { HubInspectorVirtualSection } from './HubInspectorVirtualSection.js';

/**
 * The section is a virtualised table: it renders either an empty-state panel
 * or a table built from the flattened main/detail list.
 *
 * jsdom reports every element as zero-sized, and @tanstack/react-virtual
 * derives its viewport from `offsetWidth`/`offsetHeight` — left at 0 it
 * concludes nothing is in view and renders no rows. The two stubs below give
 * the scroll container a real size; nothing else about the component is faked.
 *
 * `flattenHubInspectorRows` is covered separately in
 * HubInspectorVirtualSection.test.ts.
 */

interface Row { id: string; label: string }

const rows: Row[] = [
  { id: 'alpha', label: 'Alpha provider' },
  { id: 'beta', label: 'Beta provider' },
];

type SectionProps = React.ComponentProps<typeof HubInspectorVirtualSection<Row>>;

function renderSection(overrides: Partial<SectionProps> = {}) {
  return render(
    <HubInspectorVirtualSection<Row>
      title="Providers"
      rows={rows}
      expandedId={null}
      getRowId={(row) => row.id}
      canExpand={() => true}
      emptyMessage="No providers in catalog or runtime"
      columnCount={2}
      colGroup={<colgroup><col /><col /></colgroup>}
      tableHeader={<tr><th>Provider</th><th>Rows</th></tr>}
      renderMainRow={(row) => (
        <tr key={`main-${row.id}`}><td>{row.label}</td><td>0</td></tr>
      )}
      renderDetailRow={(row) => (
        <tr key={`detail-${row.id}`}><td colSpan={2}>cfg for {row.id}</td></tr>
      )}
      {...overrides}
    />,
  );
}

function stubSize(prop: 'offsetWidth' | 'offsetHeight', value: number) {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, value });
  return () => {
    if (original) Object.defineProperty(HTMLElement.prototype, prop, original);
  };
}

let restore: Array<() => void> = [];

beforeEach(() => {
  restore = [stubSize('offsetWidth', 600), stubSize('offsetHeight', 400)];
});

afterEach(() => {
  restore.forEach((fn) => fn());
  cleanup();
});

describe('HubInspectorVirtualSection', () => {
  it('shows the title and every row in view', () => {
    renderSection();

    expect(screen.getByRole('heading', { name: 'Providers' })).toBeDefined();
    expect(screen.getByText('Alpha provider')).toBeDefined();
    expect(screen.getByText('Beta provider')).toBeDefined();
  });

  it('renders the empty message and no table when there are no rows', () => {
    renderSection({ rows: [] });

    expect(screen.getByText('No providers in catalog or runtime')).toBeDefined();
    // No header either — an empty table with a sticky header reads as a
    // loading state rather than "nothing here".
    expect(screen.queryByRole('columnheader', { name: 'Provider' })).toBeNull();
  });

  it('renders a detail row beneath the expanded row only', () => {
    renderSection({ expandedId: 'beta' });

    expect(screen.getByText('cfg for beta')).toBeDefined();
    expect(screen.queryByText('cfg for alpha')).toBeNull();
  });

  it('does not render a detail row for a row that cannot expand', () => {
    renderSection({ expandedId: 'beta', canExpand: () => false });

    expect(screen.queryByText('cfg for beta')).toBeNull();
    expect(screen.getByText('Beta provider')).toBeDefined();
  });

  it('keeps the caller-supplied header inside the table', () => {
    renderSection();

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Provider' })).toBeDefined();
  });
});
