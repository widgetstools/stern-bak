import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOneByTestId } from '../../../../test-utils/queries';
import { SideSelector } from './SideSelector';
import { CodeBlock } from './CodeBlock';
import { FloatingWindow } from './FloatingWindow';
import { TopBar } from './TopBar';
import { ThemeToggle } from './ThemeToggle';
import { ThemeModeProvider } from '../lib/useThemeMode';
import { seedState } from '../data/seeds';
import { mockApplyTheme } from '../testSetupMocks';

describe('SideSelector', () => {
  it('renders buy/sell and calls onChange', async () => {
    const onChange = vi.fn();
    render(<SideSelector value="buy" onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Order side' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'sell' }));
    expect(onChange).toHaveBeenCalledWith('sell');
  });

  it('supports sm size', () => {
    render(<SideSelector value="sell" onChange={vi.fn()} size="sm" />);
    expect(
      screen.getAllByRole('button', { name: 'sell' }).find(
        (el) => el.getAttribute('aria-pressed') === 'true',
      ),
    ).toBeTruthy();
  });
});

describe('CodeBlock', () => {
  it('renders code and copies to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CodeBlock code="const x = 1;" label="Example" />);
    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
    await userEvent.click(getOneByTestId('code-copy'));
    expect(writeText).toHaveBeenCalledWith('const x = 1;');
  });

  it('skips copy when clipboard unavailable', async () => {
    const original = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<CodeBlock code="noop" />);
    await userEvent.click(getOneByTestId('code-copy'));
    Object.defineProperty(navigator, 'clipboard', { value: original, configurable: true });
  });
});

describe('FloatingWindow', () => {
  it('renders title, content, and closes', async () => {
    const onClose = vi.fn();
    render(
      <FloatingWindow title="Test Window" onClose={onClose} testid="float-test">
        <span>Inner</span>
      </FloatingWindow>,
    );
    expect(getOneByTestId('float-test')).toBeInTheDocument();
    expect(screen.getByText('Test Window')).toBeInTheDocument();
    expect(screen.getByText('Inner')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('TopBar', () => {
  it('renders ticker strip and action buttons', async () => {
    const handlers = {
      onNewOrder: vi.fn(),
      onRfq: vi.fn(),
      onSave: vi.fn(),
      onReset: vi.fn(),
    };
    render(
      <ThemeModeProvider>
        <TopBar state={seedState(0)} {...handlers} />
      </ThemeModeProvider>,
    );
    expect(screen.getByTestId('ds-topbar')).toBeInTheDocument();
    expect(screen.getByText('StarUI FI Terminal')).toBeInTheDocument();
    await userEvent.click(getOneByTestId('topbar-new-order'));
    await userEvent.click(getOneByTestId('topbar-rfq'));
    await userEvent.click(getOneByTestId('topbar-save'));
    await userEvent.click(getOneByTestId('topbar-reset'));
    expect(handlers.onNewOrder).toHaveBeenCalled();
    expect(handlers.onRfq).toHaveBeenCalled();
    expect(handlers.onSave).toHaveBeenCalled();
    expect(handlers.onReset).toHaveBeenCalled();
  });
});

describe('ThemeToggle', () => {
  it('toggles theme mode', async () => {
    render(
      <ThemeModeProvider>
        <ThemeToggle />
      </ThemeModeProvider>,
    );
    await userEvent.click(getOneByTestId('theme-toggle'));
    await waitFor(() => expect(mockApplyTheme).toHaveBeenCalledWith({ theme: 'light' }));
  });
});
