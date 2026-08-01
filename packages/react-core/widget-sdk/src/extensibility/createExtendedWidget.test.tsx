import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WidgetProps } from '@wellsfargo-starui/core/widget';
import type { SlotContent } from '../types/slots.js';
import { renderSlot } from './renderSlot.js';
import { createExtendedWidget } from './createExtendedWidget.js';

interface Slots {
  header?: SlotContent;
  footer?: SlotContent;
}

interface BaseProps extends WidgetProps {
  slots?: Slots;
  toolbarActions?: Record<string, () => void>;
}

/**
 * A stand-in for a real widget: it renders whatever slots it was handed and
 * exposes each toolbar action as a button, so the merge results are visible
 * to a user rather than only inspectable as props.
 */
function Base({ configId, slots, toolbarActions }: BaseProps) {
  return (
    <div>
      <p>base:{configId}</p>
      <div role="group" aria-label="header">{renderSlot(slots?.header, {})}</div>
      <div role="group" aria-label="footer">{renderSlot(slots?.footer, {})}</div>
      {Object.keys(toolbarActions ?? {}).sort().map((name) => (
        <button key={name} type="button" onClick={() => toolbarActions?.[name]?.()}>
          {name}
        </button>
      ))}
    </div>
  );
}

function wrapperNamed(label: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <div role="region" aria-label={label}>{children}</div>;
  };
}

// `globals: false` in this package's vitest config means RTL never registers
// its own auto-cleanup — without this, each render leaks into the next test.
afterEach(cleanup);

describe('createExtendedWidget', () => {
  it('injects the configured default slots', () => {
    const Extended = createExtendedWidget<BaseProps, Slots>(Base, {
      slots: { footer: <span>Position summary</span> },
    });
    render(<Extended configId="cfg-1" />);

    const footer = screen.getByRole('group', { name: 'footer' });
    expect(within(footer).getByText('Position summary')).toBeDefined();
  });

  it('lets a caller override one slot while keeping the other default', () => {
    const Extended = createExtendedWidget<BaseProps, Slots>(Base, {
      slots: { header: <span>Default header</span>, footer: <span>Default footer</span> },
    });
    render(<Extended configId="cfg-1" slots={{ footer: <span>Caller footer</span> }} />);

    expect(within(screen.getByRole('group', { name: 'header' })).getByText('Default header')).toBeDefined();
    expect(within(screen.getByRole('group', { name: 'footer' })).getByText('Caller footer')).toBeDefined();
    expect(screen.queryByText('Default footer')).toBeNull();
  });

  it('merges toolbar actions, with the caller winning on a name clash', async () => {
    const defaultExport = vi.fn();
    const callerExport = vi.fn();
    const defaultPrint = vi.fn();

    const Extended = createExtendedWidget<BaseProps, Slots>(Base, {
      toolbarActions: { export: defaultExport, print: defaultPrint },
    });
    render(<Extended configId="cfg-1" toolbarActions={{ export: callerExport }} />);

    await userEvent.click(screen.getByRole('button', { name: 'export' }));
    expect(callerExport).toHaveBeenCalledTimes(1);
    expect(defaultExport).not.toHaveBeenCalled();

    // The non-clashing default action survives the merge.
    await userEvent.click(screen.getByRole('button', { name: 'print' }));
    expect(defaultPrint).toHaveBeenCalledTimes(1);
  });

  it('nests wrappers so the first wrapper is outermost', () => {
    const Extended = createExtendedWidget<BaseProps, Slots>(Base, {
      wrappers: [wrapperNamed('outer'), wrapperNamed('inner')],
    });
    render(<Extended configId="cfg-1" />);

    const outer = screen.getByRole('region', { name: 'outer' });
    const inner = within(outer).getByRole('region', { name: 'inner' });
    expect(within(inner).getByText('base:cfg-1')).toBeDefined();
  });

  it('renders without wrappers when none are configured', () => {
    const Extended = createExtendedWidget<BaseProps, Slots>(Base, {});
    render(<Extended configId="cfg-1" />);

    expect(screen.getByText('base:cfg-1')).toBeDefined();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('derives a displayName from the base widget, and honours an explicit one', () => {
    // React DevTools and error boundaries key on displayName; `Extended(...)`
    // is what tells an author which base a variant came from.
    expect(createExtendedWidget<BaseProps, Slots>(Base, {}).displayName).toBe('Extended(Base)');
    expect(
      createExtendedWidget<BaseProps, Slots>(Base, { displayName: 'OrdersBlotter' }).displayName,
    ).toBe('OrdersBlotter');
  });

  it('falls back to "Widget" when the base component is anonymous', () => {
    const Anonymous = (props: BaseProps) => <p>anon:{props.configId}</p>;
    Object.defineProperty(Anonymous, 'name', { value: '' });

    expect(createExtendedWidget<BaseProps, Slots>(Anonymous, {}).displayName).toBe('Extended(Widget)');
  });
});
