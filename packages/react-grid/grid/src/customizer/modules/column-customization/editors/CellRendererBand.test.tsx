/**
 * CellRendererBand unit tests.
 *
 * Drives the band directly (no master-detail platform harness) so
 * the focus stays on:
 *  - Renderer-id → editor dispatch (the right editor mounts).
 *  - Config-envelope shape ({ kind, config }) when the user edits.
 *  - Zero-config renderers (e.g. `side`) show the no-config note.
 *  - Switching renderer clears the prior config.
 */
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CellRendererBand } from './CellRendererBand';
import { pickOpenOption } from '../../../test/selectHelpers';

function setup(initial: {
  cellRendererId?: string;
  cellRendererConfig?: unknown;
} = {}) {
  const setDraft = vi.fn();
  const utils = render(
    <CellRendererBand
      colId="status"
      cellRendererId={initial.cellRendererId}
      cellRendererConfig={initial.cellRendererConfig}
      setDraft={setDraft}
    />,
  );
  return { ...utils, setDraft };
}

describe('CellRendererBand', () => {
  it('mounts the PillEditor when cellRendererId is "pill"', () => {
    setup({ cellRendererId: 'pill' });
    // PillEditor surfaces an "Add rule" affordance.
    expect(screen.getByTestId('cols-status-renderer-cfg-add-rule')).toBeTruthy();
  });

  it('mounts the HeatmapEditor when cellRendererId is "heatmap"', () => {
    setup({ cellRendererId: 'heatmap' });
    expect(screen.getByTestId('cols-status-renderer-cfg-domain-toggle')).toBeTruthy();
  });

  it('shows the no-config note for zero-config renderers like "side"', () => {
    setup({ cellRendererId: 'side' });
    // No editor mounts; band falls back to the explanatory message.
    expect(screen.queryByTestId('cols-status-renderer-cfg-add-rule')).toBeNull();
    expect(screen.getByText(/has no editable configuration/i)).toBeTruthy();
  });

  it('PillEditor "add rule" patches the draft with a properly-shaped envelope', () => {
    const { setDraft } = setup({ cellRendererId: 'pill' });
    fireEvent.click(screen.getByTestId('cols-status-renderer-cfg-add-rule'));

    expect(setDraft).toHaveBeenCalledOnce();
    const patch = setDraft.mock.calls[0]![0];
    expect(patch.cellRendererConfig).toMatchObject({
      kind: 'pill',
      config: {
        rules: [expect.objectContaining({ value: '' })],
      },
    });
  });

  it('renders no editor and no note when no renderer is selected', () => {
    setup();
    expect(screen.queryByTestId('cols-status-renderer-cfg-add-rule')).toBeNull();
    expect(screen.queryByText(/has no editable configuration/i)).toBeNull();
  });

  it('does not pre-fill an editor with config from a different renderer kind', () => {
    // User picked 'pill' previously and authored config, then switched
    // the assignment to 'heatmap' — the heatmap editor must not see the
    // pill envelope as its initial value.
    setup({
      cellRendererId: 'heatmap',
      cellRendererConfig: {
        kind: 'pill',
        config: { rules: [{ value: 'X', bg: { dark: '#fff' } }] },
      },
    });
    // Heatmap-specific control still present (we didn't crash on the
    // pill envelope) and pill controls do NOT appear.
    expect(screen.getByTestId('cols-status-renderer-cfg-domain-toggle')).toBeTruthy();
    expect(screen.queryByTestId('cols-status-renderer-cfg-add-rule')).toBeNull();
  });

  it('clears renderer selection when None is picked', async () => {
    const { setDraft } = setup({ cellRendererId: 'pill' });
    await act(async () => {
      fireEvent.click(screen.getByTestId('cols-status-renderer-trigger'));
    });
    await pickOpenOption('None (default)');
    expect(setDraft).toHaveBeenCalledWith({
      cellRendererId: undefined,
      cellRendererConfig: undefined,
    });
  });

  it('preserves config envelope when selecting a renderer whose kind already matches', async () => {
    const envelope = {
      kind: 'heatmap',
      config: { domain: { min: 0, max: 25 } },
    };
    const { setDraft } = setup({
      cellRendererId: 'pill',
      cellRendererConfig: envelope,
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('cols-status-renderer-trigger'));
    });
    await pickOpenOption(/Heatmap/i);
    expect(setDraft).toHaveBeenCalledWith({
      cellRendererId: 'heatmap',
      cellRendererConfig: envelope,
    });
  });

  it('clears prior config when switching to a different renderer', async () => {
    const { setDraft } = setup({
      cellRendererId: 'pill',
      cellRendererConfig: {
        kind: 'pill',
        config: { rules: [{ value: 'Buy', bg: { dark: '#111' } }] },
      },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('cols-status-renderer-trigger'));
    });
    await pickOpenOption(/Heatmap/i);
    expect(setDraft).toHaveBeenCalledWith({
      cellRendererId: 'heatmap',
      cellRendererConfig: undefined,
    });
  });

  it('passes existing envelope config into the mounted editor', () => {
    setup({
      cellRendererId: 'pill',
      cellRendererConfig: {
        kind: 'pill',
        config: { rules: [{ value: 'Hold', bg: { dark: '#111', light: '#222' } }] },
      },
    });
    expect((screen.getByTestId('cols-status-renderer-cfg-rule-0-value') as HTMLInputElement).value).toBe('Hold');
  });
});
