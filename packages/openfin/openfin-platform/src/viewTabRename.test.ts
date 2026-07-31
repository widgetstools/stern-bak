import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CustomActionCallerType = {
  ViewTabContextMenu: 'ViewTabContextMenu',
  CustomButton: 'CustomButton',
};
const ViewTabMenuOptionType = { Custom: 'Custom' };

vi.mock('@openfin/workspace-platform', () => ({
  CustomActionCallerType,
  ViewTabMenuOptionType,
}));

const {
  ACTION_RENAME_VIEW_TAB,
  RENAME_VIEW_TAB_WINDOW_NAME,
  createRenameViewTabAction,
  injectRenameMenuItem,
} = await import('./internal/viewTabRename.js');

describe('injectRenameMenuItem', () => {
  it('leaves the payload unchanged when 0 or 2+ views are selected', () => {
    const empty = { selectedViews: [], template: [{ label: 'x' }] } as never;
    expect(injectRenameMenuItem(empty)).toBe(empty);

    const multi = {
      selectedViews: [{ name: 'a' }, { name: 'b' }],
      template: [{ label: 'x' }],
    } as never;
    expect(injectRenameMenuItem(multi)).toBe(multi);
  });

  it('prepends Save Tab As… when exactly one view is selected', () => {
    const payload = {
      selectedViews: [{ uuid: 'u', name: 'v1' }],
      template: [{ label: 'Close' }],
    };
    const next = injectRenameMenuItem(payload as never);
    expect(next.template[0]).toEqual({
      label: 'Save Tab As…',
      data: {
        type: ViewTabMenuOptionType.Custom,
        action: { id: ACTION_RENAME_VIEW_TAB },
      },
    });
    expect(next.template[1]).toEqual({ label: 'Close' });
  });
});

describe('createRenameViewTabAction', () => {
  const openChildWindow = vi.fn();
  let view: {
    executeJavaScript: ReturnType<typeof vi.fn>;
    getOptions: ReturnType<typeof vi.fn>;
  };
  let parent: { getBounds: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    openChildWindow.mockReset().mockResolvedValue(undefined);
    view = {
      executeJavaScript: vi.fn().mockResolvedValue('Doc Title'),
      getOptions: vi.fn().mockResolvedValue({ title: 'Opt Title' }),
    };
    parent = {
      getBounds: vi.fn().mockResolvedValue({ left: 100, top: 50, width: 800, height: 600 }),
    };
    vi.stubGlobal('fin', {
      View: { wrapSync: vi.fn(() => view) },
      Window: { wrapSync: vi.fn(() => parent) },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no-ops for the wrong callerType or missing selected view', async () => {
    const actions = createRenameViewTabAction(openChildWindow);
    await actions[ACTION_RENAME_VIEW_TAB]({
      callerType: CustomActionCallerType.CustomButton,
      selectedViews: [{ uuid: 'u', name: 'v' }],
    } as never);
    await actions[ACTION_RENAME_VIEW_TAB]({
      callerType: CustomActionCallerType.ViewTabContextMenu,
      selectedViews: [],
    } as never);
    expect(openChildWindow).not.toHaveBeenCalled();
  });

  it('opens a positioned rename popout seeded from document.title', async () => {
    const actions = createRenameViewTabAction(openChildWindow);
    await actions[ACTION_RENAME_VIEW_TAB]({
      callerType: CustomActionCallerType.ViewTabContextMenu,
      selectedViews: [{ uuid: 'u', name: 'v1' }],
      windowIdentity: { uuid: 'u', name: 'win' },
    } as never);

    expect(openChildWindow).toHaveBeenCalledWith(
      RENAME_VIEW_TAB_WINDOW_NAME,
      '/rename-view-tab',
      380,
      140,
      expect.objectContaining({
        defaultCentered: false,
        defaultLeft: 100 + Math.round((800 - 380) / 2),
        defaultTop: 50 + Math.round((600 - 140) / 2),
        customData: {
          view: { uuid: 'u', name: 'v1' },
          currentTitle: 'Doc Title',
        },
      }),
    );
  });

  it('falls back to options.title when document.title is empty', async () => {
    view.executeJavaScript.mockRejectedValue(new Error('no js'));
    view.getOptions.mockResolvedValue({ title: 'From Options' });
    const actions = createRenameViewTabAction(openChildWindow);
    await actions[ACTION_RENAME_VIEW_TAB]({
      callerType: CustomActionCallerType.ViewTabContextMenu,
      selectedViews: [{ uuid: 'u', name: 'v1' }],
      windowIdentity: { uuid: 'u', name: 'win' },
    } as never);
    expect(openChildWindow.mock.calls[0][4].customData.currentTitle).toBe('From Options');
  });

  it('skips internal-generated option titles and centers when bounds fail', async () => {
    view.executeJavaScript.mockResolvedValue('');
    view.getOptions.mockResolvedValue({ title: 'internal-generated-view-1' });
    parent.getBounds.mockRejectedValue(new Error('gone'));
    const actions = createRenameViewTabAction(openChildWindow);
    await actions[ACTION_RENAME_VIEW_TAB]({
      callerType: CustomActionCallerType.ViewTabContextMenu,
      selectedViews: [{ uuid: 'u', name: 'v1' }],
      windowIdentity: { uuid: 'u', name: 'win' },
    } as never);
    expect(openChildWindow.mock.calls[0][4]).toMatchObject({
      defaultCentered: true,
      customData: { currentTitle: '' },
    });
  });
});
