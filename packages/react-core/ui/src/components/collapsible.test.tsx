import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './collapsible.js';

afterEach(cleanup);

describe('Collapsible', () => {
  it('expands and collapses its panel from the trigger', async () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsibleContent>Hidden copy</CollapsibleContent>
      </Collapsible>,
    );

    expect(screen.queryByText('Hidden copy')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('Hidden copy')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.queryByText('Hidden copy')).not.toBeInTheDocument();
  });
});
