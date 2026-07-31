import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeployExportResult, DeployExportWarning } from '@wellsfargo-starui/host-config';
import { DeployExportPreviewDialog } from './DeployExportPreviewDialog';

afterEach(cleanup);

function result(over: Partial<DeployExportResult> = {}): DeployExportResult {
  const warnings = over.warnings ?? [];
  return {
    bundle: { appConfig: [], appRegistry: [], userProfiles: [], roles: [], permissions: [] },
    warnings,
    stats: {
      appConfigTotal: 10,
      appConfigIncluded: 7,
      appConfigExcluded: 3,
      referencedInstanceIds: ['inst-a', 'inst-b'],
      ...over.stats,
    },
    hasErrors: over.hasErrors ?? warnings.some((w) => w.severity === 'error'),
  };
}

function warning(severity: DeployExportWarning['severity'], code: string, message: string, configId?: string): DeployExportWarning {
  return { severity, code, message, configId };
}

function renderDialog(over: Partial<DeployExportResult> = {}, appId = 'trading') {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <DeployExportPreviewDialog
      result={result(over)}
      appId={appId}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );
  return { onCancel, onConfirm };
}

const downloadButton = () =>
  screen.getByRole('button', { name: 'Download seed.json' }) as HTMLButtonElement;

/**
 * A deploy bundle that ships with errors produces empty grids at runtime in
 * an environment nobody is watching. The gate here is the acknowledgement
 * checkbox, and the interesting question is exactly which severities it is
 * armed for — `info` deliberately does not arm it.
 */
describe('DeployExportPreviewDialog', () => {
  it('reports the scope and the row stats', () => {
    renderDialog();

    expect(screen.getByText('Export for deploy · trading')).toBeTruthy();
    expect(screen.getByText('appConfig included').nextSibling?.textContent).toBe('7');
    expect(screen.getByText('appConfig excluded').nextSibling?.textContent).toBe('3');
    expect(screen.getByText('referenced instances').nextSibling?.textContent).toBe('2');
    expect(screen.getByText('total appConfig').nextSibling?.textContent).toBe('10');
    expect(screen.getByText('instanceIds: inst-a, inst-b')).toBeTruthy();
  });

  it('falls back to "all apps" when no appId is scoped', () => {
    renderDialog({}, '');

    expect(screen.getByText('Export for deploy · all apps')).toBeTruthy();
  });

  it('omits the instanceIds line when nothing is referenced', () => {
    renderDialog({ stats: { appConfigTotal: 0, appConfigIncluded: 0, appConfigExcluded: 0, referencedInstanceIds: [] } });

    expect(screen.queryByText(/^instanceIds:/)).toBeNull();
  });

  it('downloads straight away when the bundle is clean', async () => {
    const { onConfirm } = renderDialog();

    expect(screen.getByText('No issues detected — safe to download.')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(downloadButton().disabled).toBe(false);

    await userEvent.click(downloadButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('blocks the download behind an acknowledgement when there are errors', async () => {
    const { onConfirm } = renderDialog({
      warnings: [warning('error', 'missing-instance', 'Workspace references a missing instance', 'ws-1')],
    });

    expect(downloadButton().disabled).toBe(true);
    await userEvent.click(downloadButton());
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('checkbox'));

    expect(downloadButton().disabled).toBe(false);
    await userEvent.click(downloadButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('blocks the download for warn-severity issues too', async () => {
    renderDialog({ warnings: [warning('warn', 'orphan-config', 'Orphan instance row')] });

    expect(downloadButton().disabled).toBe(true);
  });

  it('does NOT block the download when every issue is informational', async () => {
    // `hasIssues = hasErrors || warns.length > 0` — info-only bundles are
    // downloadable with no acknowledgement, and no checkbox is rendered.
    const { onConfirm } = renderDialog({ warnings: [warning('info', 'note', 'Nothing to worry about')] });

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(downloadButton().disabled).toBe(false);

    await userEvent.click(downloadButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('re-locks the download if the acknowledgement is unticked', async () => {
    const { onConfirm } = renderDialog({ warnings: [warning('warn', 'orphan-config', 'Orphan instance row')] });

    const checkbox = screen.getByRole('checkbox');
    await userEvent.click(checkbox);
    await userEvent.click(checkbox);

    expect(downloadButton().disabled).toBe(true);
    await userEvent.click(downloadButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('groups warnings by severity, errors first, with per-group counts', () => {
    renderDialog({
      warnings: [
        warning('info', 'i1', 'info one'),
        warning('warn', 'w1', 'warn one'),
        warning('error', 'e1', 'error one', 'cfg-1'),
        warning('error', 'e2', 'error two'),
      ],
    });

    const headings = screen.getAllByText(/^(Errors|Warnings|Info) \(\d+\)$/).map((n) => n.textContent?.trim());
    expect(headings).toEqual(['Errors (2)', 'Warnings (1)', 'Info (1)']);
  });

  it('shows each warning\'s code, message and originating configId', () => {
    renderDialog({ warnings: [warning('error', 'missing-instance', 'Workspace references a missing instance', 'ws-1')] });

    expect(screen.getByText('missing-instance')).toBeTruthy();
    expect(screen.getByText('· ws-1')).toBeTruthy();
    expect(screen.getByText('Workspace references a missing instance')).toBeTruthy();
  });

  it('omits the configId suffix for a bundle-level warning', () => {
    renderDialog({ warnings: [warning('error', 'empty-bundle', 'Nothing to export')] });

    expect(screen.queryByText(/^· /)).toBeNull();
  });

  it('counts every severity in the acknowledgement text, including info', () => {
    renderDialog({
      warnings: [warning('error', 'e1', 'e'), warning('info', 'i1', 'i')],
    });

    expect(screen.getByText(/I understand 2 issues below/)).toBeTruthy();
  });

  it('singularises the acknowledgement text for a lone issue', () => {
    renderDialog({ warnings: [warning('warn', 'w1', 'w')] });

    expect(screen.getByText(/I understand 1 issue below/)).toBeTruthy();
  });

  it('cancels without downloading', async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('dismisses on a backdrop click without downloading', async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('dialog'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not dismiss when the panel is clicked', async () => {
    const { onCancel } = renderDialog();

    await userEvent.click(screen.getByText('Export for deploy · trading'));

    expect(onCancel).not.toHaveBeenCalled();
  });
});
