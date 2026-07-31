import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './accordion.js';

afterEach(cleanup);

describe('Accordion', () => {
  it('expands a section when its trigger is activated', async () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="one">
          <AccordionTrigger>Section one</AccordionTrigger>
          <AccordionContent>Panel one body</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(screen.queryByText('Panel one body')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Section one' }));

    expect(screen.getByText('Panel one body')).toBeInTheDocument();
  });

  it('merges className on AccordionItem', () => {
    const { container } = render(
      <Accordion type="single" collapsible>
        <AccordionItem value="styled" className="border-red-500">
          <AccordionTrigger>Styled</AccordionTrigger>
          <AccordionContent>Body</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(container.querySelector('.border-red-500')).toBeInTheDocument();
  });
});
