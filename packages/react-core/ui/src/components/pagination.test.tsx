import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from './pagination.js';

afterEach(cleanup);

describe('Pagination', () => {
  it('exposes navigation landmarks and page links', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="/page/1" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="/page/1" isActive>
              1
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="/page/2">2</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="/page/2" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    expect(screen.getByRole('navigation', { name: 'pagination' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to previous page' })).toHaveAttribute(
      'href',
      '/page/1',
    );
    expect(screen.getByRole('link', { name: '1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '2' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Go to next page' })).toHaveAttribute(
      'href',
      '/page/2',
    );
    expect(screen.getByText('More pages')).toBeInTheDocument();
  });

  it('merges className on the nav root', () => {
    render(<Pagination className="mt-4" />);

    expect(screen.getByRole('navigation', { name: 'pagination' })).toHaveClass('mt-4');
  });
});
