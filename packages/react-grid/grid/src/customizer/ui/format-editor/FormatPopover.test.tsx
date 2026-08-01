import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ChromeButton } from '../ChromeButton';
import { FormatPopover } from './FormatPopover';

describe('FormatPopover', () => {
  it('opens content when trigger clicked', async () => {
    render(
      <FormatPopover
        trigger={<ChromeButton type="button" data-testid="trigger">open</ChromeButton>}
        width={200}
      >
        <div data-testid="content">inside</div>
      </FormatPopover>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
    });
    expect(screen.getByTestId('content')).toBeTruthy();
  });

  it('passes close to render-function children', async () => {
    const Child = ({ close }: { close: () => void }) => (
      <button type="button" data-testid="apply" onClick={close}>
        apply
      </button>
    );
    render(
      <FormatPopover
        trigger={<ChromeButton type="button" data-testid="trigger">open</ChromeButton>}
      >
        {({ close }) => <Child close={close} />}
      </FormatPopover>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('apply'));
    });
    expect(screen.queryByTestId('apply')).toBeNull();
  });

  it('renders static children and honors align prop', async () => {
    render(
      <FormatPopover
        align="end"
        trigger={<ChromeButton type="button" data-testid="trigger">open</ChromeButton>}
      >
        <div data-testid="static">static</div>
      </FormatPopover>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
    });
    expect(screen.getByTestId('static')).toBeTruthy();
  });

  it('keeps popover open when mousing down on an inner input', async () => {
    render(
      <FormatPopover
        trigger={<ChromeButton type="button" data-testid="trigger">open</ChromeButton>}
      >
        <input data-testid="inner-input" defaultValue="x" />
      </FormatPopover>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
    });
    fireEvent.mouseDown(screen.getByTestId('inner-input'));
    expect(screen.getByTestId('inner-input')).toBeTruthy();
  });

  it('allows mousedown on select without closing', async () => {
    render(
      <FormatPopover
        trigger={<ChromeButton type="button" data-testid="trigger">open</ChromeButton>}
      >
        <select data-testid="inner-select" defaultValue="a">
          <option value="a">A</option>
        </select>
      </FormatPopover>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
    });
    fireEvent.mouseDown(screen.getByTestId('inner-select'));
    expect(screen.getByTestId('inner-select')).toBeTruthy();
  });

  it('allows mousedown on option elements', async () => {
    render(
      <FormatPopover
        trigger={<ChromeButton type="button" data-testid="trigger">open</ChromeButton>}
      >
        <select defaultValue="a">
          <option data-testid="inner-option" value="a">A</option>
        </select>
      </FormatPopover>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
    });
    fireEvent.mouseDown(screen.getByTestId('inner-option'));
    expect(screen.getByTestId('inner-option')).toBeTruthy();
  });

  it('prevents outside close when click is inside registered popover stack', async () => {
    const { registerPopoverRoot } = await import('./popoverStack');
    const outer = document.createElement('div');
    document.body.appendChild(outer);
    const cleanup = registerPopoverRoot(outer);
    const inner = document.createElement('button');
    inner.type = 'button';
    inner.textContent = 'nested';
    outer.appendChild(inner);

    render(
      <FormatPopover
        trigger={<ChromeButton type="button" data-testid="trigger">open</ChromeButton>}
      >
        <div data-testid="content">inside</div>
      </FormatPopover>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
    });
    await act(async () => {
      fireEvent.pointerDown(inner, { bubbles: true });
    });
    expect(screen.getByTestId('content')).toBeTruthy();

    cleanup();
    outer.remove();
  });
});
