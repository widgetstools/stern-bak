import '../testSetupMocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getOneByTestId } from '../../../../test-utils/queries';
import { mockPerspectiveAttach, mockStreamControls } from '../testSetupMocks';
import { LabDemoProvider } from '../demo/LabDemoContext';
import { LabScenarioRail } from '../demo/LabScenarioRail';
import { LabFeatureTab } from './LabFeatureTab';
import { OVERVIEW_FEATURE } from './labFeatureConfigs';
import { LAB_ROW_ENGINE_VARIANTS, isLabRowEngine } from './labRowEngine';

/**
 * The row-engine picker is what gives all sixteen feature tabs a Perspective
 * variant from one edit, so what matters is that the shared shell switches
 * engines correctly — not that any single tab does.
 */

function renderTab(ui = <LabFeatureTab config={OVERVIEW_FEATURE} />) {
  return render(
    <LabDemoProvider>
      {ui}
      <LabScenarioRail activeTab={OVERVIEW_FEATURE.tabId} />
    </LabDemoProvider>,
  );
}

/** The mocked shadcn Select renders as a native `<select>`. */
function pickEngine(id: string) {
  const select = document.querySelector('select') as HTMLSelectElement;
  fireEvent.change(select, { target: { value: id } });
}

beforeEach(() => mockStreamControls.reset());
afterEach(cleanup);

describe('row-engine variant picker', () => {
  it('offers both engines', () => {
    renderTab();

    expect(LAB_ROW_ENGINE_VARIANTS.map((v) => v.id)).toEqual(['client', 'perspective']);
    for (const variant of LAB_ROW_ENGINE_VARIANTS) {
      expect(screen.getByText(variant.label)).toBeInTheDocument();
    }
  });

  // Absent, not `'client'`: a tab that never opts in must reach MarketsGrid
  // with the row-engine props missing, exactly as before the picker existed.
  it('defaults to the client engine and passes no row-engine props', async () => {
    renderTab();

    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument());
    const grid = getOneByTestId('markets-grid');
    expect(grid).toHaveAttribute('data-row-model', '');
    expect(grid).toHaveAttribute('data-has-perspective-table', 'false');
  });

  it('switches to the worker-held Table', async () => {
    renderTab();
    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument());

    pickEngine('perspective');

    await waitFor(() => {
      const grid = getOneByTestId('markets-grid');
      expect(grid).toHaveAttribute('data-row-model', 'perspective');
      expect(grid).toHaveAttribute('data-has-perspective-table', 'true');
      expect(grid).toHaveAttribute('data-perspective-key-column', 'id');
    });
  });

  // Both engines mount the SAME gridId, so both read and write the same saved
  // profiles. That is what makes the toggle a controlled experiment rather
  // than two separate demos that happen to share a tab.
  it('keeps the same gridId across engines', async () => {
    renderTab();
    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument());
    const before = getOneByTestId('markets-grid').getAttribute('data-grid-id');

    pickEngine('perspective');

    await waitFor(() =>
      expect(getOneByTestId('markets-grid')).toHaveAttribute('data-row-model', 'perspective'),
    );
    expect(getOneByTestId('markets-grid')).toHaveAttribute('data-grid-id', before!);
  });

  // A pending attach must reach the grid as perspective-with-no-table so the
  // surface renders its pending state. Falling back to a client grid here
  // would destroy the module platform the real grid is about to need.
  it('mounts the grid with no table while the attach is in flight', async () => {
    mockPerspectiveAttach.status = 'attaching';
    renderTab();
    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument());

    pickEngine('perspective');

    await waitFor(() => {
      const grid = getOneByTestId('markets-grid');
      expect(grid).toHaveAttribute('data-row-model', 'perspective');
      expect(grid).toHaveAttribute('data-has-perspective-table', 'false');
    });
  });

  it('renders a refusal reason rather than an indefinite spinner', async () => {
    mockPerspectiveAttach.status = 'unavailable';
    mockPerspectiveAttach.reason =
      "Provider 'mock-positions-overview-perspective' has no keyColumn, which a "
      + 'Perspective Table needs to index on.';
    renderTab();
    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument());

    pickEngine('perspective');

    await waitFor(() =>
      expect(getOneByTestId('lab-perspective-unavailable')).toHaveTextContent(
        'needs to index on',
      ),
    );
  });

  // Scenarios patch rows through the grid's transaction API — a client row
  // model's write path. Saying so beats offering buttons that do nothing.
  it('tells the demo console that scenarios are unavailable under Perspective', async () => {
    renderTab();
    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument());
    expect(screen.queryByTestId('lab-scenarios-unsupported')).toBeNull();

    pickEngine('perspective');

    await waitFor(() =>
      expect(getOneByTestId('lab-scenarios-unsupported')).toHaveTextContent(
        /book lives in the worker/i,
      ),
    );
  });
});

describe('isLabRowEngine', () => {
  it('accepts only the two engines', () => {
    expect(isLabRowEngine('client')).toBe(true);
    expect(isLabRowEngine('perspective')).toBe(true);
    expect(isLabRowEngine('ssrm')).toBe(false);
  });
});
