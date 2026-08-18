/**
 * Pure arrangement: the controls inside are the same ones the vertical panel
 * renders, so what is left to pin is the menu's own behaviour — the trigger,
 * and the mousedown guard that keeps the active AG-Grid cell from losing
 * focus when the user clicks inside the popover.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColumnMenuControl } from './ColumnMenu';
import { makeFormatterActions, makeFormatterState } from '../formatterTestHelpers';

vi.mock('../../../customizer/internal.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../customizer/internal.js')>();
  return {
    ...actual,
    useAppDataLookup: () => ({ providers: { static: {} } }),
    useAppDataProviders: () => ['static'],
    useAppDataKeys: () => ['side', 'ccy'],
  };
});

const renderMenu = (state = makeFormatterState()) =>
  render(<ColumnMenuControl state={state} actions={makeFormatterActions()} />);

describe('ColumnMenuControl', () => {
  it('starts closed behind a labelled trigger', () => {
    renderMenu();

    expect(screen.getByTestId('fmt-column-menu-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('fmt-column-menu')).not.toBeInTheDocument();
  });

  it('opens the menu and shows both sections', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByTestId('fmt-column-menu-trigger'));

    expect(screen.getByTestId('fmt-column-menu')).toBeInTheDocument();
    expect(screen.getByText('Editor & filter')).toBeInTheDocument();
    expect(screen.getByText('Behavior')).toBeInTheDocument();
  });

  it('renders the same editor and filter controls the panel does', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByTestId('fmt-column-menu-trigger'));

    expect(screen.getByTestId('fmt-editor-select')).toBeInTheDocument();
    expect(screen.getByTestId('fmt-filter-select')).toBeInTheDocument();
  });

  it('says whether cells are editable', async () => {
    const user = userEvent.setup();
    renderMenu(makeFormatterState({ cellsEditable: true }));
    await user.click(screen.getByTestId('fmt-column-menu-trigger'));

    expect(screen.getByText('Cells editable')).toBeInTheDocument();
  });

  it('says when cells are locked', async () => {
    const user = userEvent.setup();
    renderMenu(makeFormatterState({ cellsEditable: false }));
    await user.click(screen.getByTestId('fmt-column-menu-trigger'));

    expect(screen.getByText('Cells locked')).toBeInTheDocument();
  });

  it('keeps the trigger from stealing the grid cell on mousedown', () => {
    renderMenu();
    const down = fireEvent.mouseDown(screen.getByTestId('fmt-column-menu-trigger'));

    // `false` means preventDefault ran — the grid keeps its focused cell, so
    // the menu acts on the selection the user is looking at.
    expect(down).toBe(false);
  });

  it('eats mousedown on the panel chrome', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByTestId('fmt-column-menu-trigger'));

    expect(fireEvent.mouseDown(screen.getByText('Behavior'))).toBe(false);
  });

  it('lets mousedown through to a form control so it can take focus', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByTestId('fmt-column-menu-trigger'));

    // The cluster's controls are shadcn buttons, so this drives the guard's
    // allow-path with the element kinds it actually names. Eating mousedown on
    // one of these would make it impossible to type inside the menu.
    const panel = screen.getByTestId('fmt-column-menu');
    for (const tag of ['input', 'select', 'option', 'textarea']) {
      const el = document.createElement(tag);
      panel.appendChild(el);
      expect(fireEvent.mouseDown(el)).toBe(true);
      el.remove();
    }
  });
});
