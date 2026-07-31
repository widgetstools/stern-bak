import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GridInfoButton } from './GridInfoButton';

describe('GridInfoButton', () => {
  it('opens the grid info popover from the toolbar button', () => {
    render(
      <GridInfoButton
        componentName="Demo Grid"
        gridId="demo"
        instanceId="demo-inst"
        appId="app-1"
        userId="user-1"
        showLeadingDivider={false}
      />,
    );

    expect(screen.queryByText('Demo Grid')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grid info' }));
    expect(screen.getByText('Demo Grid')).toBeInTheDocument();
    expect(screen.getByText('demo-inst')).toBeInTheDocument();
  });
});
