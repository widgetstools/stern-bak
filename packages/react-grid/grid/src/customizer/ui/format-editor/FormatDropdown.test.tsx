import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ChromeButton } from '../ChromeButton';
import { FormatDropdown } from './FormatDropdown';

describe('FormatDropdown', () => {
  it('selects an option and closes', async () => {
    const onChange = vi.fn();
    render(
      <FormatDropdown
        trigger={<ChromeButton type="button" data-testid="trigger">1px</ChromeButton>}
        options={[
          { value: 1, label: '1 px' },
          { value: 2, label: '2 px' },
        ]}
        value={1}
        onChange={onChange}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('2 px'));
    });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('renders footer and icon options', async () => {
    const onChange = vi.fn();
    render(
      <FormatDropdown
        trigger={<ChromeButton type="button" data-testid="trigger">1px</ChromeButton>}
        options={[
          { value: 1, label: '1 px', icon: <span data-testid="icon-1">•</span> },
          { value: 2, label: '2 px' },
        ]}
        value={1}
        onChange={onChange}
        footer={<div data-testid="footer">more</div>}
        width={220}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
    });
    expect(screen.getByTestId('icon-1')).toBeTruthy();
    expect(screen.getByTestId('footer')).toBeTruthy();
    const option = screen.getByText('2 px').closest('button')!;
    fireEvent.mouseEnter(option);
    fireEvent.mouseLeave(option);
  });

  it('leaves value unchanged when same option picked', async () => {
    const onChange = vi.fn();
    render(
      <FormatDropdown
        trigger={<ChromeButton type="button" data-testid="trigger">1px</ChromeButton>}
        options={[{ value: 1, label: '1 px' }]}
        value={1}
        onChange={onChange}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('1 px'));
    });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('handles mouseDown on content and nested popover outside clicks', async () => {
    const onChange = vi.fn();
    const { registerPopoverRoot } = await import('./popoverStack');
    const nested = document.createElement('div');
    document.body.appendChild(nested);
    const unregister = registerPopoverRoot(nested);

    render(
      <FormatDropdown
        trigger={<ChromeButton type="button" data-testid="trigger">1px</ChromeButton>}
        options={[{ value: 1, label: '1 px' }]}
        value={1}
        onChange={onChange}
        footer={<input data-testid="footer-input" defaultValue="" />}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
    });
    const option = screen.getByText('1 px').closest('button')!;
    fireEvent.mouseDown(option);
    fireEvent.mouseEnter(option);
    fireEvent.mouseLeave(option);
    fireEvent.mouseDown(screen.getByTestId('footer-input'));
    fireEvent.pointerDown(nested);
    unregister();
    document.body.removeChild(nested);
  });
});
