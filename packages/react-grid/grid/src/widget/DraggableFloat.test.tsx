import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DraggableFloat } from './DraggableFloat';

describe('DraggableFloat', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <DraggableFloat open={false} onClose={vi.fn()}>
        <div>Body</div>
      </DraggableFloat>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders built-in header with title and close button', () => {
    render(
      <DraggableFloat open onClose={vi.fn()} title="Formatting" data-testid="float-panel">
        <div>Toolbar</div>
      </DraggableFloat>,
    );
    expect(screen.getByTestId('float-panel')).toBeInTheDocument();
    expect(screen.getByText('Formatting')).toBeInTheDocument();
    expect(screen.getByTestId('float-panel-close')).toBeInTheDocument();
    expect(screen.getByText('Toolbar')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(
      <DraggableFloat open onClose={onClose} data-testid="float-panel">
        <div>Body</div>
      </DraggableFloat>,
    );
    fireEvent.click(screen.getByTestId('float-panel-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('drags via header pointer events', () => {
    render(
      <DraggableFloat
        open
        onClose={vi.fn()}
        defaultPosition={{ x: 10, y: 20 }}
        data-testid="float-panel"
      >
        <div>Body</div>
      </DraggableFloat>,
    );
    const panel = screen.getByTestId('float-panel');
    expect(panel).toHaveStyle({ top: '20px', left: '10px' });

    const header = panel.querySelector('[title="Drag to move"]') as HTMLElement;
    fireEvent.pointerDown(header, { clientX: 10, clientY: 20, button: 0 });
    fireEvent.pointerMove(window, { clientX: 60, clientY: 70 });
    fireEvent.pointerUp(window);
    expect(panel.style.left).not.toBe('10px');
  });

  it('headless mode exposes DragHandle and CloseButton subcomponents', () => {
    const onClose = vi.fn();
    render(
      <DraggableFloat open headless onClose={onClose} data-testid="float-panel">
        <DraggableFloat.DragHandle data-testid="drag-handle" />
        <DraggableFloat.CloseButton data-testid="headless-close" />
      </DraggableFloat>,
    );
    expect(screen.getByTestId('drag-handle')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('headless-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('controlled position calls onPositionChange while dragging', () => {
    const onPositionChange = vi.fn();
    render(
      <DraggableFloat
        open
        onClose={vi.fn()}
        position={{ x: 0, y: 0 }}
        onPositionChange={onPositionChange}
        data-testid="float-panel"
      >
        <div>Body</div>
      </DraggableFloat>,
    );
    const header = screen.getByTestId('float-panel').querySelector('[title="Drag to move"]') as HTMLElement;
    fireEvent.pointerDown(header, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 30 });
    expect(onPositionChange).toHaveBeenCalled();
    fireEvent.pointerUp(window);
  });
});

describe('DraggableFloat subcomponents outside provider', () => {
  it('DragHandle and CloseButton render null without provider', () => {
    const { container } = render(
      <>
        <DraggableFloat.DragHandle data-testid="orphan-handle" />
        <DraggableFloat.CloseButton data-testid="orphan-close" />
      </>,
    );
    expect(container.querySelector('[data-testid="orphan-handle"]')).toBeNull();
    expect(container.querySelector('[data-testid="orphan-close"]')).toBeNull();
  });
});
