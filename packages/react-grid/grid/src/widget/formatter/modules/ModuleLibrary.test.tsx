import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModuleLibrary } from './ModuleLibrary';
import { makeFormatterActions, makeFormatterState } from '../formatterTestHelpers';

describe('ModuleLibrary', () => {
  it('horizontal orientation opens templates popover', async () => {
    const user = userEvent.setup();
    render(
      <ModuleLibrary
        state={makeFormatterState({
          templates: [{ id: 'tpl-a', name: 'Bold' }],
          saveAsTplName: 'New',
        })}
        actions={makeFormatterActions({
          saveAsTemplate: vi.fn().mockReturnValue('tpl-new'),
        })}
        orientation="horizontal"
        colLabel="Price"
      />,
    );
    await user.click(screen.getByTestId('templates-menu-trigger'));
    expect(screen.getByTestId('templates-menu')).toBeInTheDocument();
    expect(screen.getByTestId('tb-tpl-manager')).toBeInTheDocument();
  });

  it('vertical orientation renders inline manager', () => {
    render(
      <ModuleLibrary
        state={makeFormatterState({ templates: [{ id: 'tpl-a', name: 'Bold' }] })}
        actions={makeFormatterActions()}
        orientation="vertical"
        colLabel="Price"
      />,
    );
    expect(screen.getByTestId('fmt-panel-tpl-manager')).toBeInTheDocument();
  });

  it('horizontal save applies template and clears name', async () => {
    const user = userEvent.setup();
    const applyTemplate = vi.fn();
    const setSaveAsTplName = vi.fn();
    render(
      <ModuleLibrary
        state={makeFormatterState({
          templates: [{ id: 'tpl-a', name: 'Bold' }],
          saveAsTplName: 'Fresh',
        })}
        actions={makeFormatterActions({
          saveAsTemplate: vi.fn().mockReturnValue('tpl-new'),
          applyTemplate,
          setSaveAsTplName,
          flashSaveAsTpl: vi.fn(),
        })}
        orientation="horizontal"
        colLabel="Price"
      />,
    );
    await user.click(screen.getByTestId('templates-menu-trigger'));
    await user.click(screen.getByTestId('tb-tpl-save-btn'));
    expect(applyTemplate).toHaveBeenCalledWith('tpl-new');
    expect(setSaveAsTplName).toHaveBeenCalledWith('');
  });
});
