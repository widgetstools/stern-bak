import '../testSetupMocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getOneByTestId } from '../../../../test-utils/queries';
import { mockProviderStream, mockStreamControls } from '../testSetupMocks';
import { LabDemoProvider } from '../demo/LabDemoContext';
import { StressTestTab } from './StressTestTab';
import { STRESS_FEATURE } from './labFeatureConfigs';

/**
 * The stress tab's job is the two controls the shared shell has no reason to
 * carry — how big the book is, and a second window onto it. Everything else is
 * the same shell every other tab uses and is covered there.
 */

function renderStress() {
  return render(
    <LabDemoProvider>
      <StressTestTab />
    </LabDemoProvider>,
  );
}

beforeEach(() => mockStreamControls.reset());
afterEach(cleanup);

describe('StressTestTab', () => {
  it('mounts the grid under its own gridId', async () => {
    renderStress();

    await waitFor(() =>
      expect(getOneByTestId('markets-grid')).toHaveAttribute(
        'data-grid-id',
        STRESS_FEATURE.gridId,
      ),
    );
  });

  it('offers a row count that reaches past a comfortable book', async () => {
    renderStress();
    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument());

    expect(screen.getByText('200,000')).toBeInTheDocument();
  });

  // The count has to reach the provider, not just the picker: the mock stream
  // pushes runtime changes through `refresh(extra)` because the hub ignores
  // cfg for a slot that is already running.
  it('sends a changed row count to the provider', async () => {
    renderStress();
    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument());
    mockProviderStream.refresh.mockClear();

    const rowCountSelect = document.querySelectorAll('select')[1] as HTMLSelectElement;
    fireEvent.change(rowCountSelect, { target: { value: '50000' } });

    await waitFor(() =>
      expect(mockProviderStream.refresh).toHaveBeenCalledWith(
        expect.objectContaining({ rowCount: 50_000 }),
      ),
    );
  });

  it('offers a second window — the whole point of a shared Table', async () => {
    renderStress();
    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument());

    expect(getOneByTestId('stress-open-window')).toBeInTheDocument();
  });

  it('carries the row-engine picker like every other tab', async () => {
    renderStress();
    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument());

    const engineSelect = document.querySelectorAll('select')[0] as HTMLSelectElement;
    expect([...engineSelect.options].map((o) => o.value)).toEqual(['client', 'perspective']);
  });
});
