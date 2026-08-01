/**
 * RTL smoke + key interactions for SettingsSheet.
 */
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyModule } from '@wellsfargo-starui/engine';
import { GridPlatform } from '@wellsfargo-starui/engine';
import { GridProvider } from '@wellsfargo-starui/grid/customizer';
import { SettingsSheet } from './SettingsSheet';

vi.mock('../runtime/openFin.js', () => ({
  isOpenFin: vi.fn(() => false),
}));

let mockPoppablePopped = false;

vi.mock('../customizer/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../customizer/index.js')>();
  return {
    ...actual,
    Poppable: React.forwardRef(function MockPoppable(props: React.ComponentProps<typeof actual.Poppable>, ref) {
      React.useImperativeHandle(ref, () => ({ focusIfPopped: () => false }));
      return (
        <div data-testid="mock-poppable" data-popped={mockPoppablePopped ? 'true' : 'false'}>
          {props.children({
            popped: mockPoppablePopped,
            PopoutButton: ({ children, ...btnProps }: React.ComponentProps<'button'>) => (
              <button type="button" {...btnProps}>{children}</button>
            ),
            close: vi.fn(),
          })}
        </div>
      );
    }),
  };
});

function LegacyPanel({ gridId }: { gridId: string }) {
  return <div data-testid="legacy-panel">Grid Options for {gridId}</div>;
}

function ListPane({ selectedId, onSelect }: { gridId: string; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div data-testid="list-pane">
      <button type="button" data-testid="list-item-a" onClick={() => onSelect('a')}>A</button>
      <span data-testid="list-selected">{selectedId ?? 'none'}</span>
    </div>
  );
}

function EditorPane({ selectedId }: { gridId: string; selectedId: string | null }) {
  return <div data-testid="editor-pane">Editing {selectedId ?? 'none'}</div>;
}

const MODULES: AnyModule[] = [
  {
    id: 'general-settings',
    name: 'Grid Options',
    SettingsPanel: LegacyPanel,
  } as AnyModule,
  {
    id: 'column-customization',
    name: 'Column Settings',
    ListPane,
    EditorPane,
  } as AnyModule,
];

function mountSheet(props: Partial<React.ComponentProps<typeof SettingsSheet>> = {}) {
  const platform = new GridPlatform({ gridId: 'test-grid', modules: [] });
  const onClose = vi.fn();
  const view = render(
    <GridProvider platform={platform}>
      <SettingsSheet
        modules={MODULES}
        open
        onClose={onClose}
        {...props}
      />
    </GridProvider>,
  );
  return { ...view, onClose, platform };
}

describe('SettingsSheet', () => {
  beforeEach(() => {
    mockPoppablePopped = false;
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => '',
      transform: 'none',
    } as CSSStyleDeclaration);
  });
  afterEach(() => { cleanup(); });

  it('renders sheet chrome and default module panel', async () => {
    mountSheet();
    await waitFor(() => {
      expect(screen.getByTestId('v2-settings-sheet')).toBeInTheDocument();
    });
    expect(screen.getByTestId('legacy-panel')).toHaveTextContent('Grid Options for test-grid');
    expect(screen.getByTestId('v2-settings-done-btn')).toBeInTheDocument();
  });

  it('switches modules via hidden nav buttons', async () => {
    mountSheet();
    await waitFor(() => expect(screen.getByTestId('v2-settings-nav-column-customization')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('v2-settings-nav-column-customization'));
    await waitFor(() => expect(screen.getByTestId('v2-settings-list')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('list-item-a'));
    expect(screen.getByTestId('list-selected')).toHaveTextContent('a');
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('Editing a');
  });

  it('toggles help panel from header button', async () => {
    mountSheet();
    await waitFor(() => expect(screen.getByTestId('v2-settings-help-btn')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('v2-settings-help-btn'));
    });
    expect(screen.getByRole('heading', { name: /Formats & Expressions Cookbook/ })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('v2-settings-help-btn'));
    });
    await waitFor(() => expect(screen.getByTestId('legacy-panel')).toBeInTheDocument());
  });

  it('calls onClose from Done button', async () => {
    const { onClose } = mountSheet();
    await waitFor(() => expect(screen.getByTestId('v2-settings-done-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('v2-settings-done-btn'));
    expect(onClose).toHaveBeenCalled();
  });

  it('applies focusRequest to module and selection', async () => {
    mountSheet({
      focusRequest: { moduleId: 'column-customization', itemId: 'price', nonce: 1 },
    });
    await waitFor(() => expect(screen.getByTestId('v2-settings-list')).toBeInTheDocument());
    expect(screen.getByTestId('list-selected')).toHaveTextContent('price');
  });

  it('calls onClose from Cmd+Enter keyboard shortcut', async () => {
    const { onClose } = mountSheet();
    await waitFor(() => expect(screen.getByTestId('v2-settings-sheet')).toBeInTheDocument());

    fireEvent.keyDown(screen.getByTestId('v2-settings-sheet'), { key: 'Enter', metaKey: true });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose from Escape keyboard shortcut', async () => {
    const { onClose } = mountSheet();
    await waitFor(() => expect(screen.getByTestId('v2-settings-sheet')).toBeInTheDocument());

    fireEvent.keyDown(screen.getByTestId('v2-settings-sheet'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('opens with initialModuleId override', async () => {
    mountSheet({ initialModuleId: 'column-customization' });
    await waitFor(() => expect(screen.getByTestId('v2-settings-list')).toBeInTheDocument());
  });

  it('shows NO EDITOR fallback for modules without panels', async () => {
    const bareModule = { id: 'empty-module', name: 'Empty' } as AnyModule;
    mountSheet({ modules: [...MODULES, bareModule], initialModuleId: 'empty-module' });
    await waitFor(() => expect(screen.getByText(/NO EDITOR/)).toBeInTheDocument());
  });

  it('ignores duplicate focusRequest nonce', async () => {
    const view = mountSheet({
      focusRequest: { moduleId: 'column-customization', itemId: 'first', nonce: 1 },
    });
    await waitFor(() => expect(screen.getByTestId('list-selected')).toHaveTextContent('first'));

    view.rerender(
      <GridProvider platform={view.platform}>
        <SettingsSheet
          modules={MODULES}
          open
          onClose={view.onClose}
          focusRequest={{ moduleId: 'column-customization', itemId: 'second', nonce: 1 }}
        />
      </GridProvider>,
    );
    expect(screen.getByTestId('list-selected')).toHaveTextContent('first');
  });

  it('renders popped shell when Poppable reports popped', async () => {
    mockPoppablePopped = true;
    mountSheet();
    await waitFor(() => {
      expect(screen.getByTestId('v2-settings-sheet')).toHaveAttribute('data-popped', 'true');
    });
  });
});
