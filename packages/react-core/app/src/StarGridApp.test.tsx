import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StarGridApp, useStarGridHost } from './index.js';

const GRID_ID = 'test-grid';

function HostReader() {
  const host = useStarGridHost({ gridId: GRID_ID });
  return <div data-testid="runtime-name">{host.runtime.name}</div>;
}

describe('StarGridApp', () => {
  it('boots a browser runtime and exposes hostForGrid', async () => {
    render(
      <StarGridApp appId="test-app" userId="test-user" persistence="memory">
        <HostReader />
      </StarGridApp>,
    );
    expect(await screen.findByTestId('runtime-name')).toHaveTextContent('browser');
  });
});
