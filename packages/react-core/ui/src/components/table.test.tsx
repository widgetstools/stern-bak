import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Checkbox } from './checkbox.js';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from './table.js';

afterEach(cleanup);

describe('Table', () => {
  it('renders header, body, footer, and caption regions', () => {
    render(
      <Table>
        <TableCaption>Positions</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Select</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>AAPL</TableCell>
            <TableCell>
              <Checkbox aria-label="Select AAPL" />
            </TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>1 row</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Positions')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Symbol' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'AAPL' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select AAPL' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1 row' })).toBeInTheDocument();
  });

  it('merges className on the table element', () => {
    render(
      <Table className="text-base">
        <TableBody>
          <TableRow>
            <TableCell>Only</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole('table')).toHaveClass('text-base');
  });
});
