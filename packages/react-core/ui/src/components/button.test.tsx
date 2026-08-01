import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button.js';

afterEach(cleanup);

describe('Button', () => {
  it('fires onClick for the default variant', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick while disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders distinct classes for each variant', () => {
    const { rerender } = render(<Button variant="default">A</Button>);
    const classesFor = (label: string) => screen.getByRole('button', { name: label }).className;
    const def = classesFor('A');

    rerender(<Button variant="destructive">B</Button>);
    const destructive = classesFor('B');

    rerender(<Button variant="outline">C</Button>);
    const outline = classesFor('C');

    expect(new Set([def, destructive, outline]).size).toBe(3);
  });

  it('renders distinct classes for each size', () => {
    const { rerender } = render(<Button size="sm">A</Button>);
    const classesFor = (label: string) => screen.getByRole('button', { name: label }).className;
    const sm = classesFor('A');

    rerender(<Button size="lg">B</Button>);
    const lg = classesFor('B');

    expect(sm).not.toBe(lg);
  });

  it('merges a caller className so padding can be overridden', () => {
    render(<Button className="px-8">Wide</Button>);

    expect(screen.getByRole('button', { name: 'Wide' }).className).toContain('px-8');
  });

  it('supports asChild to render a link styled as a button', () => {
    render(
      <Button asChild variant="link">
        <a href="/docs">Docs</a>
      </Button>,
    );

    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
  });
});
