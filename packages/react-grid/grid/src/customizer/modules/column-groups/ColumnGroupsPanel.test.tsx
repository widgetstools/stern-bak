/**
 * Integration tests for the v4 ColumnGroupsPanel rewrite.
 *
 * Covers the surfaces most likely to regress during the cleanup:
 *  - List rail: mount, add, auto-select-first, dirty-LED via per-platform
 *    DirtyBus (NOT via window event broadcast).
 *  - Editor: empty-state, rename draft, SAVE commits, move up/down,
 *    delete, subgroup add.
 */
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/engine';
import { GridProvider } from '../../hooks/GridProvider';
import { ColumnGroupsEditor, ColumnGroupsList } from './ColumnGroupsPanel';
import { columnGroupsModule } from './index';
import type { ColumnGroupsState } from './state';

function makePlatform() {
  // Seed two sibling groups so move / ordering is exercisable without
  // spinning up a real grid API.
  const platform = new GridPlatform({ gridId: 'test-grid', modules: [columnGroupsModule] });
  platform.store.setModuleState<ColumnGroupsState>('column-groups', () => ({
    groups: [
      { groupId: 'g-alpha', headerName: 'Alpha', children: [], openByDefault: true },
      { groupId: 'g-beta',  headerName: 'Beta',  children: [], openByDefault: false },
    ],
    openGroupIds: {},
  }));
  return platform;
}

function MasterDetail({ platform }: { platform: GridPlatform }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  return (
    <GridProvider platform={platform}>
      <ColumnGroupsList gridId="test-grid" selectedId={selectedId} onSelect={setSelectedId} />
      <ColumnGroupsEditor gridId="test-grid" selectedId={selectedId} />
    </GridProvider>
  );
}

describe('ColumnGroupsPanel (v4)', () => {
  let platform: GridPlatform;
  beforeAll(() => {
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = () => {};
    }
  });

  beforeEach(() => { platform = makePlatform(); });
  afterEach(cleanup);

  // ─── Structure ────────────────────────────────────────────────────

  it('renders the list + editor for the seeded groups', () => {
    render(<MasterDetail platform={platform} />);
    expect(screen.getByTestId('cg-add-group-btn')).toBeTruthy();
    expect(screen.getByTestId('cg-group-g-alpha')).toBeTruthy();
    expect(screen.getByTestId('cg-group-g-beta')).toBeTruthy();
  });

  it('auto-selects the first group and mounts its editor', () => {
    render(<MasterDetail platform={platform} />);
    expect(screen.getByTestId('cg-group-editor-g-alpha')).toBeTruthy();
    // Move up disabled for the first sibling, move down enabled.
    expect((screen.getByTestId('cg-up-g-alpha') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('cg-down-g-alpha') as HTMLButtonElement).disabled).toBe(false);
  });

  it('ADD appends a new top-level group and selects it', () => {
    render(<MasterDetail platform={platform} />);
    const before = platform.store.getModuleState<ColumnGroupsState>('column-groups').groups.length;

    act(() => screen.getByTestId('cg-add-group-btn').click());

    const after = platform.store.getModuleState<ColumnGroupsState>('column-groups').groups.length;
    expect(after).toBe(before + 1);

    // Editor for the new group is mounted — look up any editor with a
    // grp_* id.
    const editor = document.querySelector('[data-testid^="cg-group-editor-grp_"]');
    expect(editor).toBeTruthy();
  });

  // ─── Draft / SAVE / dirty-bus ─────────────────────────────────────

  it('rename only edits the draft until SAVE is clicked', () => {
    render(<MasterDetail platform={platform} />);
    const name = screen.getByTestId('cg-name-g-alpha') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Alpha v2' } });

    expect(name.value).toBe('Alpha v2');
    expect(
      platform.store.getModuleState<ColumnGroupsState>('column-groups')
        .groups.find((g) => g.groupId === 'g-alpha')!.headerName,
    ).toBe('Alpha');

    act(() => screen.getByTestId('cg-save-g-alpha').click());

    expect(
      platform.store.getModuleState<ColumnGroupsState>('column-groups')
        .groups.find((g) => g.groupId === 'g-alpha')!.headerName,
    ).toBe('Alpha v2');
  });

  it('dirty state registers on the per-platform DirtyBus under `column-groups:<id>`', () => {
    render(<MasterDetail platform={platform} />);
    const name = screen.getByTestId('cg-name-g-alpha') as HTMLInputElement;

    expect(platform.resources.dirty().isDirty('column-groups:g-alpha')).toBe(false);

    fireEvent.change(name, { target: { value: 'Dirty' } });
    expect(platform.resources.dirty().isDirty('column-groups:g-alpha')).toBe(true);

    act(() => screen.getByTestId('cg-save-g-alpha').click());
    expect(platform.resources.dirty().isDirty('column-groups:g-alpha')).toBe(false);
  });

  it('RESET discards unsaved group edits without closing the editor', () => {
    render(<MasterDetail platform={platform} />);
    const name = screen.getByTestId('cg-name-g-alpha') as HTMLInputElement;

    fireEvent.change(name, { target: { value: 'Unsaved Group' } });
    expect(platform.resources.dirty().isDirty('column-groups:g-alpha')).toBe(true);

    act(() => screen.getByTestId('cg-reset-g-alpha').click());

    expect(name.value).toBe('Alpha');
    expect(platform.resources.dirty().isDirty('column-groups:g-alpha')).toBe(false);
    expect(screen.getByTestId('cg-group-editor-g-alpha')).toBeTruthy();
    expect(
      platform.store.getModuleState<ColumnGroupsState>('column-groups')
        .groups.find((g) => g.groupId === 'g-alpha')!.headerName,
    ).toBe('Alpha');
  });

  // ─── Structural ops ───────────────────────────────────────────────

  it('move-down swaps the committed tree order', () => {
    render(<MasterDetail platform={platform} />);
    act(() => screen.getByTestId('cg-down-g-alpha').click());

    const ids = platform.store
      .getModuleState<ColumnGroupsState>('column-groups')
      .groups.map((g) => g.groupId);
    expect(ids).toEqual(['g-beta', 'g-alpha']);
  });

  it('DELETE removes the group directly from the list item', () => {
    render(
      <GridProvider platform={platform}>
        <ColumnGroupsList
          gridId="test-grid"
          selectedId={null}
          onSelect={() => {}}
        />
      </GridProvider>,
    );
    expect(screen.queryByTestId('cg-group-editor-g-alpha')).toBeNull();

    act(() => screen.getByTestId('cg-delete-g-alpha').click());

    const ids = platform.store
      .getModuleState<ColumnGroupsState>('column-groups')
      .groups.map((g) => g.groupId);
    expect(ids).toEqual(['g-beta']);
  });

  it('empty-state renders when no group is selected', () => {
    render(
      <GridProvider platform={platform}>
        <ColumnGroupsEditor gridId="test-grid" selectedId={null} />
      </GridProvider>,
    );
    expect(screen.getByText(/No group selected/i)).toBeTruthy();
  });
});
