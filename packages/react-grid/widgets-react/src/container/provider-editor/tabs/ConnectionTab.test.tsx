import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionTab } from './ConnectionTab.js';

vi.mock('../transports/StompFields.js', () => ({
  StompFields: ({ onChange }: { onChange: (n: object) => void }) => (
    <button type="button" onClick={() => onChange({ websocketUrl: 'ws://x' })}>stomp-fields</button>
  ),
}));
vi.mock('../transports/RestFields.js', () => ({
  RestFields: () => <div>rest-fields</div>,
}));
vi.mock('../transports/MockFields.js', () => ({
  MockFields: () => <div>mock-fields</div>,
}));
vi.mock('../transports/AppDataFields.js', () => ({
  AppDataFields: () => <div data-testid="appdata-fields">appdata</div>,
}));

const probe = {
  testing: false,
  testResult: null as { success: boolean; rowCount?: number; error?: string } | null,
  inferring: false,
  inferredFields: [],
  inferenceSummary: null,
  inferenceError: null,
  test: vi.fn(),
  infer: vi.fn(),
  reset: vi.fn(),
};

describe('ConnectionTab', () => {
  it('shows Test Connection for stomp and invokes probe.test', async () => {
    const user = userEvent.setup();
    render(
      <ConnectionTab
        cfg={{ providerType: 'stomp', websocketUrl: 'ws://x' } as never}
        onCfgChange={vi.fn()}
        probe={probe}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Test Connection/i }));
    expect(probe.test).toHaveBeenCalled();
  });

  it('renders appdata fields without the scroll wrapper', () => {
    render(
      <ConnectionTab
        cfg={{ providerType: 'appdata', variables: {} } as never}
        onCfgChange={vi.fn()}
        probe={probe}
      />,
    );
    expect(screen.getByTestId('appdata-fields')).toBeInTheDocument();
  });

  it('shows success pill with row count', () => {
    render(
      <ConnectionTab
        cfg={{ providerType: 'rest' } as never}
        onCfgChange={vi.fn()}
        probe={{
          ...probe,
          testResult: { success: true, rowCount: 3 },
        }}
      />,
    );
    expect(screen.getByText(/received 3 rows/)).toBeInTheDocument();
  });

  it('shows error pill on failed test', () => {
    render(
      <ConnectionTab
        cfg={{ providerType: 'rest' } as never}
        onCfgChange={vi.fn()}
        probe={{
          ...probe,
          testResult: { success: false, error: 'timeout' },
        }}
      />,
    );
    expect(screen.getByText('timeout')).toBeInTheDocument();
  });

  it('falls back for unknown provider types', () => {
    render(
      <ConnectionTab
        cfg={{ providerType: 'custom' } as never}
        onCfgChange={vi.fn()}
        probe={probe}
      />,
    );
    expect(screen.getByText(/No editor for "custom"/)).toBeInTheDocument();
  });
});
