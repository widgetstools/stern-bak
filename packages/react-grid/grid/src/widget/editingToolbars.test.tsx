import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { BulkUpdateToolbar } from './BulkUpdateToolbar';
import { EditHistoryToolbar } from './EditHistoryToolbar';
import { SmartEditToolbar } from './SmartEditToolbar';

vi.mock('../customizer/modules/bulk-update/BulkUpdateToolbarBody', () => ({
  BulkUpdateToolbarBody: () => <div data-testid="bulk-update-body" />,
}));
vi.mock('../customizer/modules/data-change-history/EditHistoryToolbarBody', () => ({
  EditHistoryToolbarBody: () => <div data-testid="edit-history-body" />,
}));
vi.mock('../customizer/modules/smart-edit/SmartEditToolbarBody', () => ({
  SmartEditToolbarBody: () => <div data-testid="smart-edit-body" />,
}));

describe('optional editing toolbars', () => {
  it('BulkUpdateToolbar renders the customizer body', () => {
    const { getByTestId } = render(<BulkUpdateToolbar />);
    expect(getByTestId('bulk-update-body')).toBeInTheDocument();
  });

  it('EditHistoryToolbar renders the customizer body', () => {
    const { getByTestId } = render(<EditHistoryToolbar />);
    expect(getByTestId('edit-history-body')).toBeInTheDocument();
  });

  it('SmartEditToolbar renders the customizer body', () => {
    const { getByTestId } = render(<SmartEditToolbar />);
    expect(getByTestId('smart-edit-body')).toBeInTheDocument();
  });
});
