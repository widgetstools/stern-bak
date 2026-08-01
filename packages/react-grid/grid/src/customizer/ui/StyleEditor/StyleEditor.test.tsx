import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StyleEditor } from './StyleEditor';

describe('StyleEditor', () => {
  it('renders inline sections with subset ordering', () => {
    render(
      <StyleEditor
        value={{}}
        onChange={() => {}}
        sections={['text', 'format']}
        dataType="number"
        data-testid="se-inline"
      />,
    );
    expect(screen.getByTestId('se-inline')).toBeTruthy();
    expect(screen.getByText('TYPE')).toBeTruthy();
    expect(screen.getByText('FORMAT')).toBeTruthy();
    expect(screen.queryByText('COLOUR')).toBeNull();
  });

  it('opens uncontrolled popover via trigger', async () => {
    const onOpenChange = vi.fn();
    render(
      <StyleEditor
        value={{}}
        onChange={() => {}}
        variant="popover"
        onOpenChange={onOpenChange}
        trigger={<button type="button" data-testid="trigger">Edit</button>}
        data-testid="se-pop"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
    });
    expect(screen.getByTestId('se-pop')).toBeTruthy();
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('renders controlled dialog variant when open', () => {
    render(
      <StyleEditor
        value={{}}
        onChange={() => {}}
        variant="dialog"
        open
        trigger={<button type="button">Edit</button>}
        data-testid="se-dialog"
      />,
    );
    expect(screen.getByTestId('se-dialog')).toBeTruthy();
  });

  it('opens drawer variant with custom width', async () => {
    render(
      <StyleEditor
        value={{}}
        onChange={() => {}}
        variant="drawer"
        width={400}
        trigger={<button type="button" data-testid="trigger">Edit</button>}
        data-testid="se-drawer"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
    });
    expect(screen.getByTestId('se-drawer')).toBeTruthy();
  });

  it('forwards onChange from nested sections', () => {
    const onChange = vi.fn();
    render(
      <StyleEditor
        value={{}}
        onChange={onChange}
        sections={['text']}
        data-testid="se"
      />,
    );
    fireEvent.click(screen.getByTitle('Bold'));
    expect(onChange).toHaveBeenCalledWith({ bold: true });
  });

  it('renders all default sections inline', () => {
    render(
      <StyleEditor value={{}} onChange={() => {}} data-testid="se-all" />,
    );
    expect(screen.getByText('TYPE')).toBeTruthy();
    expect(screen.getByText('COLOUR')).toBeTruthy();
    expect(screen.getByText('BORDER')).toBeTruthy();
    expect(screen.getByText('FORMAT')).toBeTruthy();
  });
});
