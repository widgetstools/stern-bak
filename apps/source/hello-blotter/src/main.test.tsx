/**
 * `main.tsx` is a bootstrap: it builds one provider config and mounts one
 * `StarGrid` at module scope. There is nothing exported to call, so the test
 * drives it the way the browser does — import the module, and assert on what
 * it handed to `createRoot().render()`.
 *
 * React Testing Library renders that captured element, so the assertions are
 * about what the app puts on screen rather than about the shape of a React
 * element object.
 */
// The shared setup file registers these matchers at runtime, but it lives
// outside this app's `include`, so the types have to be pulled in here.
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';

const createStarui = vi.fn();
const rendered = vi.fn();

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  createStarui: (cfg: unknown) => {
    createStarui(cfg);
    return {
      Provider: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="starui-provider">{children}</div>
      ),
    };
  },
}));

vi.mock('@wellsfargo-starui/grid/widgets', () => ({
  StarGrid: (props: Record<string, unknown>) => (
    <div
      data-testid="star-grid"
      data-grid-id={String(props.gridId)}
      data-provider-id={String(props.providerId)}
      data-full-bleed={String(props.fullBleed)}
    >
      {String(props.title)}
    </div>
  ),
}));

vi.mock('react-dom/client', () => ({
  createRoot: () => ({ render: (el: ReactElement) => rendered(el) }),
}));

vi.mock('./index.css', () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  document.body.innerHTML = '<div id="root"></div>';
});

/** Import for its side effect and hand back the element it mounted. */
async function bootstrap(): Promise<ReactElement> {
  await import('./main');
  expect(rendered).toHaveBeenCalledTimes(1);
  return rendered.mock.calls[0][0] as ReactElement;
}

describe('hello-blotter bootstrap', () => {
  it('mounts the grid inside the starui provider', async () => {
    render(await bootstrap());

    expect(screen.getByTestId('starui-provider')).toBeInTheDocument();
    // Inside the provider, not beside it — the grid needs its context.
    expect(screen.getByTestId('starui-provider')).toContainElement(
      screen.getByTestId('star-grid'),
    );
  });

  it('names the grid and its provider, and asks for a full-bleed layout', async () => {
    render(await bootstrap());

    const grid = screen.getByTestId('star-grid');
    expect(grid).toHaveAttribute('data-grid-id', 'hello-blotter');
    expect(grid).toHaveAttribute('data-provider-id', 'dp-hello-positions');
    expect(grid).toHaveAttribute('data-full-bleed', 'true');
    expect(grid).toHaveTextContent('Positions');
  });

  it('declares one stomp-ssrm provider whose id the grid actually asks for', async () => {
    await bootstrap();

    const cfg = createStarui.mock.calls[0][0] as {
      appId: string;
      userId: string;
      providers: Array<{ providerId: string; providerType: string; config: Record<string, unknown> }>;
    };
    expect(cfg.appId).toBe('HelloBlotter');
    expect(cfg.providers).toHaveLength(1);

    const [provider] = cfg.providers;
    // The one wiring mistake this file can make: the grid asking for an id the
    // config does not declare, which fails at runtime and nowhere else.
    expect(provider.providerId).toBe('dp-hello-positions');
    expect(provider.providerType).toBe('stomp-ssrm');
    expect(provider.config).toMatchObject({
      providerType: 'stomp-ssrm',
      keyColumn: 'positionId',
      publishWindowMs: 200,
      snapshotEndToken: 'Success',
    });
  });

  it('points the transport at a websocket URL and a listener topic', async () => {
    await bootstrap();
    const cfg = createStarui.mock.calls[0][0] as {
      providers: Array<{ config: { websocketUrl: string; listenerTopic: string; requestMessage: string } }>;
    };
    const { websocketUrl, listenerTopic, requestMessage } = cfg.providers[0].config;
    expect(websocketUrl).toMatch(/^wss?:\/\//);
    expect(listenerTopic.startsWith('/')).toBe(true);
    // The request message addresses the same topic it listens on; a mismatch
    // here is a silent no-data start.
    expect(requestMessage.startsWith(listenerTopic)).toBe(true);
  });
});
