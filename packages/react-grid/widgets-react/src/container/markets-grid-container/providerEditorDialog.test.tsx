import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderEditorDialog } from './ProviderEditorDialog.js';

vi.mock('../provider-editor/DataProviderEditor.js', () => ({
  DataProviderEditor: (props: { onClose?: () => void }) => (
    <div data-testid="data-provider-editor">
      <button type="button" onClick={() => props.onClose?.()}>close-editor</button>
    </div>
  ),
}));

describe('ProviderEditorDialog', () => {
  it('renders the editor shell when open', () => {
    render(
      <ProviderEditorDialog
        open
        providerId="dp-1"
        userId="dev"
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('provider-editor-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('data-provider-editor')).toBeInTheDocument();
  });

  it('hides content when closed', () => {
    render(
      <ProviderEditorDialog
        open={false}
        providerId="dp-1"
        userId="dev"
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('data-provider-editor')).not.toBeInTheDocument();
  });

  it('forwards close from the nested editor', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ProviderEditorDialog
        open
        providerId="dp-1"
        userId="dev"
        onOpenChange={onOpenChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'close-editor' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
