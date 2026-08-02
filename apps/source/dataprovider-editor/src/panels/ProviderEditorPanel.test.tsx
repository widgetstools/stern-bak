import '../testSetupMocks';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOneByTestId } from '../../../../test-utils/queries';
import { ProviderEditorPanel } from './ProviderEditorPanel';

describe('ProviderEditorPanel', () => {
  it('renders DataProviderEditor with the logged-in user id', () => {
    render(<ProviderEditorPanel />);

    const editor = getOneByTestId('data-provider-editor');
    expect(editor).toHaveAttribute('data-user-id', 'dev1');
    expect(editor).not.toHaveAttribute('data-initial-id');
  });

  it('passes initialProviderId and onClose through to the editor', async () => {
    const onClose = vi.fn();
    render(
      <ProviderEditorPanel initialProviderId="dp-123" onClose={onClose} />,
    );

    const editor = screen
      .getAllByTestId('data-provider-editor')
      .find((el) => el.getAttribute('data-initial-id') === 'dp-123');
    expect(editor).toHaveAttribute('data-initial-id', 'dp-123');

    for (const btn of screen.getAllByRole('button', { name: 'Close editor' })) {
      await userEvent.click(btn);
      if (onClose.mock.calls.length > 0) break;
    }
    expect(onClose).toHaveBeenCalledOnce();
  });
});
