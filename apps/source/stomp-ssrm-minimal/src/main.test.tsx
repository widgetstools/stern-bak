import { beforeEach, describe, expect, it, vi } from 'vitest';
import './test/setupMocks.js';
import { staruiTestState } from './test/setupMocks.js';

export const mainTestState = {
  render: vi.fn(),
  createRoot: vi.fn(),
  bootstrap: vi.fn(),
};

mainTestState.createRoot.mockImplementation(() => ({ render: mainTestState.render }));

vi.mock('react-dom/client', () => ({
  createRoot: (...args: unknown[]) => mainTestState.createRoot(...args),
}));

vi.mock('./bootstrap.js', () => ({
  bootstrap: (...args: unknown[]) => mainTestState.bootstrap(...args),
}));

vi.mock('./styles.css', () => ({}));

describe('main', () => {
  beforeEach(() => {
    vi.resetModules();
    mainTestState.render.mockReset();
    mainTestState.createRoot.mockClear();
    mainTestState.bootstrap.mockReset();
    mainTestState.createRoot.mockImplementation(() => ({ render: mainTestState.render }));
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('bootstraps platform then renders App inside DataHubProvider', async () => {
    const config = { userId: 'dev1', appId: 'stomp-minimal', useRest: false };
    mainTestState.bootstrap.mockResolvedValue({ config, platform: staruiTestState.platform });

    await import('./main.js');

    await vi.waitFor(() => {
      expect(mainTestState.bootstrap).toHaveBeenCalledTimes(1);
    });

    expect(mainTestState.createRoot).toHaveBeenCalledWith(document.getElementById('root'));
    expect(mainTestState.render).toHaveBeenCalledTimes(1);

    const renderedTree = mainTestState.render.mock.calls[0]?.[0];
    expect(renderedTree.type).toBeDefined();
    expect(renderedTree.props.children.type.name).toBe('DataHubProvider');
    expect(renderedTree.props.children.props.platform).toBe(staruiTestState.platform);
    expect(renderedTree.props.children.props.userId).toBe('dev1');
  });
});
