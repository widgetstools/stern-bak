import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateManager, type TemplateManagerProps } from './TemplateManager';

function makeProps(overrides: Partial<TemplateManagerProps> = {}): TemplateManagerProps {
  return {
    templates: [
      { id: 'tpl-a', name: 'Bold' },
      { id: 'tpl-b', name: 'Currency' },
    ],
    activeTemplateId: 'tpl-a',
    saveName: '',
    saveConfirmed: false,
    onSaveNameChange: vi.fn(),
    onSave: vi.fn(),
    onApply: vi.fn(),
    onDelete: vi.fn(),
    onUpdate: vi.fn(),
    onRename: vi.fn(),
    capturableFields: ['Styles', 'Formatter'],
    variant: 'compact',
    testIdPrefix: 'tb-tpl',
    ...overrides,
  };
}

describe('TemplateManager — compact variant', () => {
  it('applies a template when a row is clicked', () => {
    const props = makeProps();
    render(<TemplateManager {...props} />);
    fireEvent.click(screen.getByTestId('tb-tpl-row-tpl-b'));
    expect(props.onApply).toHaveBeenCalledWith('tpl-b');
  });

  it('saves when name is entered and save button clicked', async () => {
    const user = userEvent.setup();
    const props = makeProps({ saveName: 'New Style' });
    render(<TemplateManager {...props} />);
    await user.click(screen.getByTestId('tb-tpl-save-btn'));
    expect(props.onSave).toHaveBeenCalled();
  });

  it('two-step delete confirms on second click', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<TemplateManager {...props} />);
    await user.click(screen.getByTestId('tb-tpl-row-tpl-a-delete'));
    await user.click(screen.getByTestId('tb-tpl-row-tpl-a-delete-confirm'));
    expect(props.onDelete).toHaveBeenCalledWith('tpl-a');
  });

  it('renames inline in compact list', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<TemplateManager {...props} />);
    await user.click(screen.getByTestId('tb-tpl-row-tpl-b-rename'));
    const input = screen.getByTestId('tb-tpl-row-tpl-b-rename-input');
    await user.clear(input);
    await user.type(input, 'Renamed{Enter}');
    expect(props.onRename).toHaveBeenCalledWith('tpl-b', 'Renamed');
  });

  it('shows capture hint when capturableFields provided', () => {
    render(<TemplateManager {...makeProps()} />);
    expect(screen.getByTestId('tb-tpl-capture-hint')).toHaveTextContent('Styles · Formatter');
  });

  it('compact row update calls onUpdate', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<TemplateManager {...props} />);
    await user.click(screen.getByTestId('tb-tpl-row-tpl-a-update'));
    expect(props.onUpdate).toHaveBeenCalledWith('tpl-a');
  });
});

describe('TemplateManager — panel variant', () => {
  it('renders select picker and action buttons', () => {
    const props = makeProps({ variant: 'panel', testIdPrefix: 'fmt-panel-tpl' });
    render(<TemplateManager {...props} />);
    expect(screen.getByTestId('fmt-panel-tpl-picker')).toBeInTheDocument();
    expect(screen.getByTestId('fmt-panel-tpl-update-btn')).toBeInTheDocument();
  });

  it('updates selected template via action button', async () => {
    const user = userEvent.setup();
    const props = makeProps({ variant: 'panel', testIdPrefix: 'fmt-panel-tpl' });
    render(<TemplateManager {...props} />);
    await user.click(screen.getByTestId('fmt-panel-tpl-update-btn'));
    expect(props.onUpdate).toHaveBeenCalledWith('tpl-a');
  });

  it('panel variant rename flow commits through onRename', async () => {
    const user = userEvent.setup();
    const props = makeProps({ variant: 'panel', testIdPrefix: 'fmt-panel-tpl' });
    render(<TemplateManager {...props} />);
    await user.click(screen.getByTestId('fmt-panel-tpl-rename-btn'));
    const input = screen.getByTestId('fmt-panel-tpl-rename-input');
    await user.clear(input);
    await user.type(input, 'Renamed{Enter}');
    expect(props.onRename).toHaveBeenCalledWith('tpl-a', 'Renamed');
  });

  it('panel variant delete uses two-step confirm', async () => {
    const user = userEvent.setup();
    const props = makeProps({ variant: 'panel', testIdPrefix: 'fmt-panel-tpl' });
    render(<TemplateManager {...props} />);
    await user.click(screen.getByTestId('fmt-panel-tpl-delete-btn'));
    await user.click(screen.getByTestId('fmt-panel-tpl-delete-confirm'));
    expect(props.onDelete).toHaveBeenCalledWith('tpl-a');
  });

  it('shows empty hint when no templates exist', () => {
    render(<TemplateManager {...makeProps({ templates: [], variant: 'panel', testIdPrefix: 'tpl' })} />);
    expect(screen.getByTestId('tpl-empty-hint')).toBeInTheDocument();
  });
});
