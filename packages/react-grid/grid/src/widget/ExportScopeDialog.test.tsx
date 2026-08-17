/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExportScopeDialog } from './ExportScopeDialog';

describe('ExportScopeDialog', () => {
  const REASON =
    'Export writes the rows this grid has loaded, not the full server-side dataset.';

  it('stays closed while the export covers the dataset', () => {
    render(<ExportScopeDialog reason="" onCancel={() => {}} onExportAnyway={() => {}} />);
    expect(screen.queryByTestId('export-scope-confirm')).toBeNull();
  });

  it('renders the port’s reason verbatim rather than copy of its own', () => {
    // One reason string, written once, on the capability. A second wording
    // here would drift from the one the tooltip and the toolbar show.
    render(<ExportScopeDialog reason={REASON} onCancel={() => {}} onExportAnyway={() => {}} />);
    expect(screen.getByTestId('export-scope-reason').textContent).toBe(REASON);
  });

  it('exports once on confirm', () => {
    // Radix closes on the action click, so `onOpenChange(false)` — and with it
    // `onCancel` — runs too. Both handlers only clear the pending warning, and
    // the export has already fired, so the pair is idempotent; what must not
    // happen is the export running twice.
    const onExportAnyway = vi.fn();
    render(
      <ExportScopeDialog reason={REASON} onCancel={() => {}} onExportAnyway={onExportAnyway} />,
    );

    fireEvent.click(screen.getByTestId('export-scope-confirm-export'));
    expect(onExportAnyway).toHaveBeenCalledTimes(1);
  });

  it('cancels without exporting', () => {
    const onExportAnyway = vi.fn();
    const onCancel = vi.fn();
    render(
      <ExportScopeDialog reason={REASON} onCancel={onCancel} onExportAnyway={onExportAnyway} />,
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
    expect(onExportAnyway).not.toHaveBeenCalled();
  });
});
