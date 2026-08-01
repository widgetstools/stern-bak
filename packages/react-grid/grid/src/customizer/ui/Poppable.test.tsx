import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { Poppable, type PoppableHandle } from './Poppable';

function createFakePopout() {
  const doc = document.implementation.createHTMLDocument('popout');
  Object.defineProperty(doc, 'readyState', { value: 'complete', configurable: true });
  const close = vi.fn();
  const state = { closed: false };
  const win = {
    document: doc,
    get closed() { return state.closed; },
    close: () => { state.closed = true; close(); },
    focus: vi.fn(),
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as Window;
  return { win, close, doc };
}

describe('Poppable', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders inline by default with PopoutButton', () => {
    render(
      <Poppable name="t" title="T">
        {({ PopoutButton }) => (
          <div>
            inline
            <PopoutButton data-testid="pop-btn" />
          </div>
        )}
      </Poppable>,
    );
    expect(screen.getByText('inline')).toBeTruthy();
    expect(screen.getByTestId('pop-btn')).toBeTruthy();
  });

  it('opens popout portal when PopoutButton clicked', async () => {
    const fake = createFakePopout();
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);

    render(
      <Poppable name="pop" title="Pop" width={400} height={300}>
        {({ PopoutButton, popped }) => (
          <div data-testid={popped ? 'popped' : 'inline'}>
            <PopoutButton data-testid="pop-btn" />
          </div>
        )}
      </Poppable>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('pop-btn'));
    });
    expect(fake.doc.querySelector('[data-testid="popped"]')).toBeTruthy();
  });

  it('focusIfPopped returns false when inline', () => {
    const ref = createRef<PoppableHandle>();
    render(
      <Poppable ref={ref} name="t" title="T">
        {() => <div />}
      </Poppable>,
    );
    expect(ref.current?.focusIfPopped()).toBe(false);
  });

  it('PopoutButton is hidden while popped', async () => {
    const fake = createFakePopout();
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);

    render(
      <Poppable name="pop" title="Pop">
        {({ PopoutButton, popped }) => (
          <div data-testid={popped ? 'popped' : 'inline'}>
            <PopoutButton data-testid="pop-btn" />
          </div>
        )}
      </Poppable>,
    );
    expect(screen.getByTestId('pop-btn')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('pop-btn'));
    });
    expect(screen.queryByTestId('pop-btn')).toBeNull();
    expect(fake.doc.querySelector('[data-testid="popped"]')).toBeTruthy();
  });
});
