import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GridInfoContent } from './GridInfoContent';

describe('GridInfoContent', () => {
  it('renders identity rows with em dash placeholders for missing ids', () => {
    render(
      <GridInfoContent
        componentName="Orders Grid"
        gridId="orders"
        instanceId={undefined}
        appId={undefined}
        userId={undefined}
      />,
    );

    expect(screen.getByText('Orders Grid')).toBeInTheDocument();
    expect(screen.getAllByText('orders').length).toBeGreaterThan(0);
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getByText(window.location.pathname)).toBeInTheDocument();
  });

  it('uses instanceId when provided', () => {
    render(
      <GridInfoContent
        componentName={undefined}
        gridId="orders"
        instanceId="inst-42"
        appId="app"
        userId="user"
      />,
    );
    expect(screen.getByText('inst-42')).toBeInTheDocument();
    expect(screen.getByText('app')).toBeInTheDocument();
    expect(screen.getByText('user')).toBeInTheDocument();
  });
});
