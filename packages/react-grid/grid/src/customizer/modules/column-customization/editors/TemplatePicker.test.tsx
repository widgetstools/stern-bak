import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TemplatePicker } from './TemplatePicker';
import type { ColumnTemplate } from '../../column-templates';
import { pickNativeSelect } from '../../../test/selectHelpers';

const T1: ColumnTemplate = { id: 't1', name: 'Bold header', overrides: {} };
const T2: ColumnTemplate = { id: 't2', name: 'Red negative', overrides: {} };

describe('TemplatePicker', () => {
  it('lists templates not yet applied', async () => {
    const onAdd = vi.fn();
    render(
      <TemplatePicker
        colId="price"
        allTemplates={{ t1: T1, t2: T2 }}
        appliedIds={['t1']}
        onAdd={onAdd}
      />,
    );
    await pickNativeSelect('cols-price-template-picker', 'Red negative');
    expect(onAdd).toHaveBeenCalledWith('t2');
  });

  it('shows hint when all templates already applied', () => {
    render(
      <TemplatePicker
        colId="price"
        allTemplates={{ t1: T1 }}
        appliedIds={['t1']}
        onAdd={() => {}}
      />,
    );
    expect(screen.getByText(/All templates already applied/i)).toBeTruthy();
  });
});
