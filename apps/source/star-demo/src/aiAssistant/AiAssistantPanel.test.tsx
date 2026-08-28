import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { AiAssistantPanel } from './AiAssistantPanel';

/**
 * A scoped panel is pinned to the window it was opened from (see
 * useToolExecutor.ts's dispatchTool) — this covers the panel-side half of
 * that fix: it resolves and displays which window and layout a conversation
 * is actually working on, and reports both to the page header via
 * onScopeResolved. The chat loop, drag/drop, undo stack and panel
 * collapse/resize are pre-existing behavior untouched by this change and are
 * stubbed out rather than re-verified here.
 */

const GRID_ENTRY = {
  id: 'grid-axe-blotter', configId: 'grid-axe-blotter', componentType: 'grid', componentSubType: 'axe-blotter',
  displayName: 'Axe Blotter', hostUrl: '/#/blotters/marketsgrid', iconId: '', createdAt: '',
  type: 'internal' as const, usesHostConfig: true, appId: 'Star-Demo', configServiceUrl: '',
  singleton: false, asWindow: true,
};

vi.mock('../platformBootstrap', () => ({
  usePlatformBootstrap: () => ({ config: { appId: 'Star-Demo' }, platform: { configManager: {} } }),
}));

vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadRegistryConfig: vi.fn().mockResolvedValue({ entries: [] }),
}));

vi.mock('./llmClient', () => ({
  checkHealth: vi.fn().mockResolvedValue(true),
  fetchModels: vi.fn().mockResolvedValue([]),
  pickDefaultModel: vi.fn().mockReturnValue(''),
}));

const mockResolveGridForInstance = vi.fn();
const mockReadActiveProfile = vi.fn();
vi.mock('./gridProfiles', () => ({
  resolveGridForInstance: (...args: unknown[]) => mockResolveGridForInstance(...args),
  resolveGridEntry: vi.fn().mockResolvedValue(undefined),
  readActiveProfile: (...args: unknown[]) => mockReadActiveProfile(...args),
}));

vi.mock('./useToolExecutor', () => ({
  useToolExecutor: () => ({ executeTool: vi.fn() }),
}));

vi.mock('./useUndoStack', () => ({
  useUndoStack: () => ({ lastLabel: null, beginTurn: vi.fn(), noteToolCall: vi.fn(), endTurn: vi.fn(), undoLast: vi.fn() }),
}));

vi.mock('./chat/useChatSession', () => ({
  useChatSession: () => ({
    transcript: [],
    messages: { current: [] },
    isBusy: false,
    error: null,
    send: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    setError: vi.fn(),
    noteContext: vi.fn(),
  }),
}));

// The chat column and the analysis panel are unrelated to this fix — stubbed
// so the test isn't coupled to their internals.
vi.mock('./chat/ChatTranscript', () => ({ ChatTranscript: () => null }));
vi.mock('./chat/Composer', () => ({ Composer: () => null }));
vi.mock('./chat/AnalysisPanel', () => ({ AnalysisPanel: () => null }));

// `apps/` is a separate npm install root from `packages/` (see CLAUDE.md), so
// anything from `@wellsfargo-starui/react` that pulls in Radix (Select) or
// react-resizable-panels resolves against a DIFFERENT React copy than this
// test's — "Invalid hook call". Stubbed here the same way ChatTranscript.test.tsx
// stubs ScrollArea for the same reason; `cn` is a plain function, safe to keep.
vi.mock('@wellsfargo-starui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/react')>();
  return {
    cn: actual.cn,
    Button: ({ children, ...props }: React.ComponentProps<'button'>) => <button {...props}>{children}</button>,
    Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
    Select: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SelectTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    ResizablePanelGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    ResizablePanel: React.forwardRef<unknown, { children?: React.ReactNode }>(({ children }, ref) => {
      React.useImperativeHandle(ref, () => ({ collapse: () => {}, expand: () => {}, isCollapsed: () => false }));
      return <div>{children}</div>;
    }),
    ResizableHandle: () => null,
  };
});

beforeEach(() => {
  window.localStorage.clear();
  mockResolveGridForInstance.mockReset().mockResolvedValue(GRID_ENTRY);
  mockReadActiveProfile.mockReset().mockResolvedValue({
    id: 'l1', gridId: 'dev1grid-axe-blotter-1700000000000', name: 'L1', state: {}, createdAt: 1, updatedAt: 1,
  });
});

describe('AiAssistantPanel — scoped instance and active layout', () => {
  it('reads the active profile from the FOCUSED WINDOW, not the template', async () => {
    render(
      <AiAssistantPanel
        locked
        scopedGridId="grid-axe-blotter"
        scopedInstanceId="dev1grid-axe-blotter-1700000000000"
      />,
    );

    await waitFor(() => expect(mockReadActiveProfile).toHaveBeenCalled());
    // Not the template row (`entry.configId`) — the specific window this
    // conversation is pinned to, mirroring dispatchTool's default pin.
    expect(mockReadActiveProfile).toHaveBeenCalledWith({}, 'dev1grid-axe-blotter-1700000000000');
  });

  it('shows the resolved window and its active layout in the header', async () => {
    render(
      <AiAssistantPanel
        locked
        scopedGridId="grid-axe-blotter"
        scopedInstanceId="dev1grid-axe-blotter-1700000000000"
        scopedGridName="Axe Blotter"
      />,
    );

    expect(await screen.findByText(/this window/i)).toBeInTheDocument();
    expect(await screen.findByText(/L1/)).toBeInTheDocument();
  });

  it('reports the instance id and active layout to onScopeResolved', async () => {
    const onScopeResolved = vi.fn();
    render(
      <AiAssistantPanel
        locked
        scopedGridId="grid-axe-blotter"
        scopedInstanceId="dev1grid-axe-blotter-1700000000000"
        onScopeResolved={onScopeResolved}
      />,
    );

    await waitFor(() =>
      expect(onScopeResolved).toHaveBeenCalledWith(
        expect.objectContaining({
          gridId: 'grid-axe-blotter',
          instanceId: 'dev1grid-axe-blotter-1700000000000',
          profileId: 'l1',
          profileName: 'L1',
        }),
      ),
    );
  });

  it('does not read an active profile for an unscoped (dock-launched) panel', () => {
    render(<AiAssistantPanel />);
    expect(mockResolveGridForInstance).not.toHaveBeenCalled();
    expect(mockReadActiveProfile).not.toHaveBeenCalled();
  });
});
