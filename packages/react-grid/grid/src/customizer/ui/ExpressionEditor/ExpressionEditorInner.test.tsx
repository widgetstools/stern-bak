import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorView } from '@codemirror/view';
import ExpressionEditorInner from './ExpressionEditorInner';

const COLUMNS = [{ colId: 'price', headerName: 'Price', dataType: 'number' }];
const FUNCTIONS = [
  {
    name: 'SUM',
    category: 'Math',
    signature: 'SUM(x)',
    description: 'Sum values',
  },
];

async function waitForView() {
  await waitFor(() => expect(document.querySelector('.cm-editor')).toBeTruthy());
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor')!);
  expect(view).toBeTruthy();
  return view!;
}

describe('ExpressionEditorInner', () => {
  it('mounts CodeMirror editor surface', async () => {
    render(
      <ExpressionEditorInner
        value="1 + 1"
        onCommit={() => {}}
        data-testid="expr"
      />,
    );
    expect(screen.getByTestId('expr')).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.cm-editor')).toBeTruthy());
  });

  it('syncs external value changes', async () => {
    const { rerender } = render(
      <ExpressionEditorInner value="A" onCommit={() => {}} data-testid="expr" />,
    );
    await waitFor(() => expect(document.querySelector('.cm-editor')).toBeTruthy());
    rerender(<ExpressionEditorInner value="B" onCommit={() => {}} data-testid="expr" />);
    await waitFor(() => expect(document.querySelector('.cm-editor')?.textContent).toContain('B'));
  });

  it('exposes imperative handle getValue', async () => {
    const ref = { current: null as import('./types').ExpressionEditorHandle | null };
    render(
      <ExpressionEditorInner
        value="SUM(1)"
        onCommit={() => {}}
        handleRef={ref}
        data-testid="expr"
      />,
    );
    await waitFor(() => expect(ref.current?.getValue()).toBe('SUM(1)'));
  });

  it('renders multiline editor with wrapping', async () => {
    render(
      <ExpressionEditorInner
        value="line1\nline2"
        onCommit={() => {}}
        multiline
        lines={3}
        data-testid="expr"
      />,
    );
    await waitFor(() => expect(document.querySelector('.cm-editor')).toBeTruthy());
    expect(screen.getByTestId('expr').style.height).not.toBe('24px');
  });

  it('calls onChange while typing and onCommit on Enter', async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <ExpressionEditorInner
        value=""
        onChange={onChange}
        onCommit={onCommit}
        placeholder="expr…"
        className="extra"
        style={{ minHeight: 40 }}
        validate
        warnDeprecated={false}
        data-testid="expr"
      />,
    );
    const view = await waitForView();
    view.focus();
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '1+2' } });
    expect(onChange).toHaveBeenCalledWith('1+2');
    fireEvent.keyDown(view.contentDOM, { key: 'Enter', code: 'Enter', bubbles: true });
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith('1+2'));
    expect(screen.getByTestId('expr').className).toContain('extra');
  });

  it('opens palettes and help via keyboard chords', async () => {
    render(
      <ExpressionEditorInner
        value=""
        onCommit={() => {}}
        columnsProvider={() => COLUMNS}
        functionsProvider={() => FUNCTIONS}
        data-testid="expr"
      />,
    );
    const view = await waitForView();
    const user = userEvent.setup();
    await user.click(view.contentDOM);
    await user.keyboard('{Control>}{Shift>}c{/Shift}{/Control}');
    await waitFor(() => expect(screen.getByText('Columns')).toBeTruthy());
    fireEvent.keyDown(window, { key: 'Escape' });

    await user.click(view.contentDOM);
    await user.keyboard('{Control>}{Shift>}f{/Shift}{/Control}');
    await waitFor(() => expect(screen.getByText('Functions')).toBeTruthy());
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(view.state.doc.toString()).toContain('SUM('));

    await user.keyboard('{F1}');
    await waitFor(() => expect(screen.getByLabelText('Expression editor help')).toBeTruthy());
  });

  it('focuses via imperative handle and respects readOnly', async () => {
    const ref = { current: null as import('./types').ExpressionEditorHandle | null };
    render(
      <ExpressionEditorInner
        value="RO"
        onCommit={() => {}}
        readOnly
        handleRef={ref}
        columnsProvider={() => COLUMNS}
        validate={false}
        fontSize={13}
        data-testid="expr"
      />,
    );
    await waitFor(() => expect(ref.current?.getValue()).toBe('RO'));
    ref.current?.focus();
    const view = await waitForView();
    const user = userEvent.setup();
    await user.click(view.contentDOM);
    await user.keyboard('{Control>}{Shift>}c{/Shift}{/Control}');
    await waitFor(() => expect(screen.getByText('Columns')).toBeTruthy());
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(ref.current?.getValue()).toBe('RO');
  });
});
