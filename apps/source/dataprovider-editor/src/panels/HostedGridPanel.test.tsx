import '../testSetupMocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOneByTestId } from '../../../../test-utils/queries';
import { HostedGridPanel } from './HostedGridPanel';
import { initPlatformBootstrap } from '../platformBootstrap';

describe('HostedGridPanel', () => {
  beforeEach(async () => {
    await initPlatformBootstrap();
  });

  it('renders HostedMarketsGrid with expected props', () => {
    render(
      <HostedGridPanel
        instanceId="dataprovider-editor-demo-a"
        componentName="Grid A"
      />,
    );

    const grid = getOneByTestId('hosted-markets-grid');
    expect(grid).toHaveAttribute('data-grid-id', 'dataprovider-editor-demo-a');
    expect(grid).toHaveAttribute('data-component-name', 'Grid A');
  });

  it('forwards onEditProvider from the hosted grid toolbar', async () => {
    const onEditProvider = vi.fn();
    render(
      <HostedGridPanel
        instanceId="dataprovider-editor-demo-b"
        componentName="Grid B"
        onEditProvider={onEditProvider}
      />,
    );

    for (const btn of screen.getAllByTestId('edit-provider')) {
      await userEvent.click(btn);
      if (onEditProvider.mock.calls.length > 0) break;
    }
    expect(onEditProvider).toHaveBeenCalledWith('provider-1');
  });

  it('uses a translateZ containing block wrapper', () => {
    const { container } = render(
      <HostedGridPanel instanceId="demo" componentName="Demo" />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.transform).toBe('translateZ(0)');
  });
});
