import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from './resizable.js';

afterEach(cleanup);

describe('Resizable', () => {
  it('renders panels and an optional drag handle', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={50}>Left</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50}>Right</ResizablePanel>
      </ResizablePanelGroup>,
    );

    expect(screen.getByText('Left')).toBeInTheDocument();
    expect(screen.getByText('Right')).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('merges className on the panel group', () => {
    const { container } = render(
      <ResizablePanelGroup className="border" direction="horizontal">
        <ResizablePanel>Only</ResizablePanel>
      </ResizablePanelGroup>,
    );

    expect(container.querySelector('.border')).toBeInTheDocument();
  });
});
