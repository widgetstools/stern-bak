import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TemplatesBand } from './TemplatesBand';
import type { ColumnTemplate } from '../../column-templates';

const T1: ColumnTemplate = { id: 't1', name: 'Bold header', overrides: {} };
const T2: ColumnTemplate = { id: 't2', name: 'Red negative', overrides: {} };

describe('TemplatesBand', () => {
  it('renders applied template chips with remove affordance', () => {
    const onRemove = vi.fn();
    render(
      <TemplatesBand
        colId="price"
        templates={[T1]}
        allTemplates={{ t1: T1, t2: T2 }}
        appliedIds={['t1']}
        onAdd={() => {}}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByTestId('cols-price-template-t1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('cols-price-template-remove-t1'));
    expect(onRemove).toHaveBeenCalledWith('t1');
  });

  it('shows empty hint when no templates applied', () => {
    render(
      <TemplatesBand
        colId="price"
        templates={[]}
        allTemplates={{ t1: T1 }}
        appliedIds={[]}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText(/No style templates on this column yet/i)).toBeTruthy();
  });

  it('shows plural hint and hover styling for multiple templates', () => {
    const onRemove = vi.fn();
    render(
      <TemplatesBand
        colId="qty"
        templates={[T1, T2]}
        allTemplates={{ t1: T1, t2: T2 }}
        appliedIds={['t1', 't2']}
        onAdd={() => {}}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText(/2 templates/i)).toBeTruthy();
    const chip = screen.getByTestId('cols-qty-template-t2');
    const removeBtn = screen.getByTestId('cols-qty-template-remove-t2');
    fireEvent.mouseEnter(removeBtn);
    fireEvent.mouseLeave(removeBtn);
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('t2');
    expect(chip).toBeTruthy();
  });
});
