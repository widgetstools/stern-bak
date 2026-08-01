import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { BorderStyleEditor, type BordersValue } from './BorderStyleEditor';

describe('BorderStyleEditor', () => {
  it('renders side preset buttons and preview', () => {
    render(<BorderStyleEditor value={{}} onChange={() => {}} data-testid="be" />);
    expect(screen.getByTestId('be')).toBeTruthy();
    expect(screen.getByTestId('ds-be-preview')).toBeTruthy();
    expect(screen.getByTestId('ds-be-side-a')).toBeTruthy();
  });

  it('turns on all sides when A clicked from empty', () => {
    const onChange = vi.fn();
    render(<BorderStyleEditor value={{}} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('ds-be-side-a'));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0];
    expect(next.top?.width).toBeGreaterThan(0);
  });

  it('clears borders via clear button', () => {
    const onChange = vi.fn();
    render(
      <BorderStyleEditor
        value={{ top: { color: '#fff', alpha: 100, width: 1, style: 'solid', visible: true } }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('ds-be-clear'));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('selects individual sides and edits thickness', async () => {
    const onChange = vi.fn();
    render(
      <BorderStyleEditor
        value={{
          top: { color: '#FFFFFF', alpha: 100, width: 1, style: 'solid', visible: true },
        }}
        onChange={onChange}
        data-testid="be"
      />,
    );
    fireEvent.click(screen.getByTestId('ds-be-side-l'));
    expect(onChange).toHaveBeenCalled();

    onChange.mockClear();
    fireEvent.click(screen.getByTestId('ds-be-side-l'));
    expect(onChange).toHaveBeenCalled();

    onChange.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByTestId('ds-be-color'));
    });
    expect(screen.getByTestId('ds-be-preview')).toBeTruthy();
  });

  it('changes border style from dropdown', async () => {
    const onChange = vi.fn();
    render(
      <BorderStyleEditor
        value={{
          top: { color: '#FFFFFF', alpha: 100, width: 1, style: 'solid', visible: true },
        }}
        onChange={onChange}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('ds-be-style'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Dashed'));
    });
    expect(onChange).toHaveBeenCalled();
  });

  it('changes border width from dropdown', async () => {
    const onChange = vi.fn();
    render(
      <BorderStyleEditor
        value={{
          top: { color: '#FFFFFF', alpha: 100, width: 1, style: 'solid', visible: true },
        }}
        onChange={onChange}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('ds-be-width'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('3 px'));
    });
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0].top?.width).toBe(3);
  });

  it('clears all sides when A clicked with all sides on', () => {
    const spec = { color: '#2dd4bf', alpha: 100, width: 1, style: 'solid' as const, visible: true };
    const onChange = vi.fn();
    render(
      <BorderStyleEditor
        value={{ top: spec, right: spec, bottom: spec, left: spec }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('ds-be-side-a'));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('selects an on side without toggling off', () => {
    const spec = { color: '#FFFFFF', alpha: 100, width: 1, style: 'solid' as const, visible: true };
    const onChange = vi.fn();
    render(
      <BorderStyleEditor
        value={{ top: spec, left: spec }}
        onChange={onChange}
      />,
    );
    onChange.mockClear();
    fireEvent.click(screen.getByTestId('ds-be-side-t'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('ds-be-side-l'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('restores edge spec from memory after toggle off/on', async () => {
    const spec = { color: '#FF0000', alpha: 100, width: 2, style: 'dashed' as const, visible: true };
    function Harness() {
      const [value, setValue] = useState<BordersValue>({ top: spec });
      return <BorderStyleEditor value={value} onChange={setValue} />;
    }
    render(<Harness />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('ds-be-side-t'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('ds-be-side-t'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('ds-be-side-t'));
    });
    expect(screen.getByTestId('ds-be-side-t')).toHaveAttribute('data-on', 'true');
  });

  it('patches all on sides when edit target is all', async () => {
    const spec = { color: '#FFFFFF', alpha: 100, width: 1, style: 'solid' as const, visible: true };
    const onChange = vi.fn();
    render(
      <BorderStyleEditor
        value={{ top: spec, bottom: spec }}
        onChange={onChange}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('ds-be-style'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Dotted'));
    });
    const next = onChange.mock.calls.at(-1)?.[0];
    expect(next?.top?.style).toBe('dotted');
    expect(next?.bottom?.style).toBe('dotted');
  });

  it('seeds top border when patching with no sides on', async () => {
    const onChange = vi.fn();
    render(<BorderStyleEditor value={{}} onChange={onChange} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('ds-be-width'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('2 px'));
    });
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0].top?.width).toBe(2);
  });

  it('disables clear when no borders applied', () => {
    render(<BorderStyleEditor value={{}} onChange={() => {}} />);
    expect(screen.getByTestId('ds-be-clear')).toBeDisabled();
  });
});
