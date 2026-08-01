import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { reducer } from './use-toast.js';

afterEach(cleanup);

describe('useToast', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('keeps only the most recent toast when the queue limit is exceeded', async () => {
    const { useToast, toast } = await import('./use-toast.js');
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ title: 'First' });
      toast({ title: 'Second' });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.title).toBe('Second');
  });

  it('marks a toast closed when dismissed', async () => {
    const { useToast, toast } = await import('./use-toast.js');
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ title: 'Dismiss me' });
    });

    const toastId = result.current.toasts[0]?.id;
    expect(result.current.toasts[0]?.open).toBe(true);

    act(() => {
      result.current.dismiss(toastId);
    });

    expect(result.current.toasts[0]?.open).toBe(false);
  });

  it('reducer enforces the toast limit on ADD_TOAST', () => {
    const first = reducer(
      { toasts: [] },
      {
        type: 'ADD_TOAST',
        toast: { id: '1', open: true, title: 'One' },
      },
    );
    const second = reducer(first, {
      type: 'ADD_TOAST',
      toast: { id: '2', open: true, title: 'Two' },
    });

    expect(second.toasts).toHaveLength(1);
    expect(second.toasts[0]?.title).toBe('Two');
  });

  it('updates an existing toast', () => {
    const state = reducer(
      { toasts: [] },
      {
        type: 'ADD_TOAST',
        toast: { id: '1', open: true, title: 'Original' },
      },
    );

    const updated = reducer(state, {
      type: 'UPDATE_TOAST',
      toast: { id: '1', title: 'Updated' },
    });

    expect(updated.toasts[0]?.title).toBe('Updated');
    expect(updated.toasts[0]?.open).toBe(true);
  });

  it('dismisses all toasts when no toastId provided', async () => {
    const { useToast, toast } = await import('./use-toast.js');
    const { result } = renderHook(() => useToast());

    act(() => {
      toast({ title: 'Toast 1' });
    });

    expect(result.current.toasts[0]?.open).toBe(true);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.toasts[0]?.open).toBe(false);
  });

  it('removes a specific toast', () => {
    const state = reducer(
      { toasts: [] },
      {
        type: 'ADD_TOAST',
        toast: { id: '1', open: false, title: 'To Remove' },
      },
    );

    const removed = reducer(state, {
      type: 'REMOVE_TOAST',
      toastId: '1',
    });

    expect(removed.toasts).toHaveLength(0);
  });

  it('removes all toasts when no toastId provided on REMOVE_TOAST', () => {
    const state = reducer(
      { toasts: [] },
      {
        type: 'ADD_TOAST',
        toast: { id: '1', open: false, title: 'Toast' },
      },
    );

    const removed = reducer(state, {
      type: 'REMOVE_TOAST',
    });

    expect(removed.toasts).toHaveLength(0);
  });

  it('calls onOpenChange when toast is dismissed via callback', async () => {
    const { useToast, toast } = await import('./use-toast.js');
    const { result } = renderHook(() => useToast());

    let capturedCallback: ((open: boolean) => void) | null = null;

    act(() => {
      toast({ title: 'Callback test' });
    });

    const toastOnOpenChange = result.current.toasts[0]?.onOpenChange;
    expect(toastOnOpenChange).toBeDefined();

    act(() => {
      toastOnOpenChange?.(false);
    });

    expect(result.current.toasts[0]?.open).toBe(false);
  });

  it('returns dismiss and update functions from toast', async () => {
    const { toast } = await import('./use-toast.js');

    const result = toast({ title: 'Test' });

    expect(result.id).toBeDefined();
    expect(typeof result.dismiss).toBe('function');
    expect(typeof result.update).toBe('function');
  });

  it('allows updating a toast via returned update function', async () => {
    const { useToast, toast } = await import('./use-toast.js');
    const { result } = renderHook(() => useToast());

    let toastResult: any;
    act(() => {
      toastResult = toast({ title: 'Original' });
    });

    act(() => {
      toastResult.update({ id: toastResult.id, title: 'Updated' });
    });

    expect(result.current.toasts[0]?.title).toBe('Updated');
  });
});
