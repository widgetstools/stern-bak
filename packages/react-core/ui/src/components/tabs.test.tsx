import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs.js';

afterEach(cleanup);

describe('Tabs', () => {
  it('shows the selected tab panel', async () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview panel</TabsContent>
        <TabsContent value="details">Details panel</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Overview panel')).toBeVisible();

    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));

    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Details panel')).toBeVisible();
  });

  it('does not activate a disabled tab', async () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger disabled value="locked">
            Locked
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview panel</TabsContent>
        <TabsContent value="locked">Locked panel</TabsContent>
      </Tabs>,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Locked' }));

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');
    expect(screen.queryByText('Locked panel')).not.toBeInTheDocument();
  });

  it('merges className on the tab list', () => {
    render(
      <Tabs defaultValue="one">
        <TabsList className="w-full">
          <TabsTrigger value="one">One</TabsTrigger>
        </TabsList>
        <TabsContent value="one">Panel</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole('tablist')).toHaveClass('w-full');
  });
});
