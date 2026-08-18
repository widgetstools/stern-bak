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

describe('ModuleLibrary — horizontal popover', () => {
  const state = (over = {}) =>
    makeFormatterState({
      templates: [{ id: 'tpl-a', name: 'Bold' }],
      saveAsTplName: 'Fresh',
      activeTemplateId: 'tpl-a',
      ...over,
    });

  function renderHorizontal(actions = makeFormatterActions(), over = {}) {
    return render(
      <ModuleLibrary
        state={state(over)}
        actions={actions}
        orientation="horizontal"
        colLabel="Price"
      />,
    );
  }

  it('closes the popover once a template is applied', async () => {
    const user = userEvent.setup();
    const applyTemplate = vi.fn();
    renderHorizontal(makeFormatterActions({ applyTemplate }));
    await user.click(screen.getByTestId('templates-menu-trigger'));

    await user.click(screen.getByTestId('tb-tpl-row-tpl-a'));

    expect(applyTemplate).toHaveBeenCalledWith('tpl-a');
    // The toolbar gets out of the way once the pick has landed.
    expect(screen.queryByTestId('templates-menu')).not.toBeInTheDocument();
  });

  it('does not apply or clear when the save was refused', async () => {
    const user = userEvent.setup();
    const applyTemplate = vi.fn();
    const setSaveAsTplName = vi.fn();
    renderHorizontal(
      makeFormatterActions({
        saveAsTemplate: vi.fn().mockReturnValue(undefined),
        applyTemplate,
        setSaveAsTplName,
      }),
    );
    await user.click(screen.getByTestId('templates-menu-trigger'));

    await user.click(screen.getByTestId('tb-tpl-save-btn'));
    expect(applyTemplate).not.toHaveBeenCalled();
    expect(setSaveAsTplName).not.toHaveBeenCalled();
  });

  it('trims the save name', async () => {
    const user = userEvent.setup();
    const saveAsTemplate = vi.fn().mockReturnValue('tpl-new');
    renderHorizontal(makeFormatterActions({ saveAsTemplate }), { saveAsTplName: '  Fresh  ' });
    await user.click(screen.getByTestId('templates-menu-trigger'));

    await user.click(screen.getByTestId('tb-tpl-save-btn'));
    expect(saveAsTemplate).toHaveBeenCalledWith('Fresh');
  });

  it('re-snapshots the column into an existing template', async () => {
    const user = userEvent.setup();
    const updateTemplate = vi.fn();
    renderHorizontal(makeFormatterActions({ updateTemplate }));
    await user.click(screen.getByTestId('templates-menu-trigger'));

    await user.click(screen.getByTestId('tb-tpl-row-tpl-a-update'));
    expect(updateTemplate).toHaveBeenCalledWith('tpl-a');
  });

  it('eats mousedown on the popover chrome to keep the grid cell', async () => {
    const user = userEvent.setup();
    renderHorizontal();
    await user.click(screen.getByTestId('templates-menu-trigger'));

    expect(fireEvent.mouseDown(screen.getByTestId('templates-menu'))).toBe(false);
  });

  it('lets mousedown reach a form control so its dropdown can open', async () => {
    const user = userEvent.setup();
    renderHorizontal();
    await user.click(screen.getByTestId('templates-menu-trigger'));
    const menu = screen.getByTestId('templates-menu');

    // A native <select> opens on mousedown; eating it here is what once kept
    // the template dropdown from opening out of the toolbar popover.
    for (const tag of ['input', 'select', 'option', 'textarea']) {
      const el = document.createElement(tag);
      menu.appendChild(el);
      expect(fireEvent.mouseDown(el)).toBe(true);
      el.remove();
    }
  });
});

describe('ModuleLibrary — vertical panel', () => {
  function renderVertical(actions = makeFormatterActions(), over = {}) {
    return render(
      <ModuleLibrary
        state={makeFormatterState({
          templates: [{ id: 'tpl-a', name: 'Bold' }],
          activeTemplateId: 'tpl-a',
          saveAsTplName: 'Fresh',
          ...over,
        })}
        actions={actions}
        orientation="vertical"
        colLabel="Price"
      />,
    );
  }

  it('saves, applies and clears the name', async () => {
    const user = userEvent.setup();
    const applyTemplate = vi.fn();
    const setSaveAsTplName = vi.fn();
    const flashSaveAsTpl = vi.fn();
    renderVertical(
      makeFormatterActions({
        saveAsTemplate: vi.fn().mockReturnValue('tpl-new'),
        applyTemplate,
        setSaveAsTplName,
        flashSaveAsTpl,
      }),
    );

    await user.click(screen.getByTestId('fmt-panel-tpl-save-btn'));
    expect(applyTemplate).toHaveBeenCalledWith('tpl-new');
    expect(setSaveAsTplName).toHaveBeenCalledWith('');
    expect(flashSaveAsTpl).toHaveBeenCalled();
  });

  it('does not apply when the save was refused', async () => {
    const user = userEvent.setup();
    const applyTemplate = vi.fn();
    renderVertical(
      makeFormatterActions({ saveAsTemplate: vi.fn().mockReturnValue(''), applyTemplate }),
    );

    await user.click(screen.getByTestId('fmt-panel-tpl-save-btn'));
    expect(applyTemplate).not.toHaveBeenCalled();
  });

  it('re-snapshots the column into an existing template', async () => {
    const user = userEvent.setup();
    const updateTemplate = vi.fn();
    renderVertical(makeFormatterActions({ updateTemplate }));

    await user.click(screen.getByTestId('fmt-panel-tpl-update-btn'));
    expect(updateTemplate).toHaveBeenCalledWith('tpl-a');
  });
});
