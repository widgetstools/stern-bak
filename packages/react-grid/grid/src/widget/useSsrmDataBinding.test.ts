import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { GridPlatform, SsrmDataBinding } from '@wellsfargo-starui/core';
import { useSsrmDataBinding, useSsrmDataBindingSync } from './useSsrmDataBinding';
import type { MarketsGridSsrmProps } from './types';

const provider = { id: 'p1' } as unknown as MarketsGridSsrmProps['provider'];
const otherProvider = { id: 'p2' } as unknown as MarketsGridSsrmProps['provider'];

function fakePlatform() {
  const bindSsrm = vi.fn();
  const unbindSsrm = vi.fn();
  return {
    platform: { data: { bindSsrm, unbindSsrm } } as unknown as GridPlatform,
    bindSsrm,
    unbindSsrm,
  };
}

describe('useSsrmDataBinding', () => {
  it('is undefined for a client-side grid', () => {
    const { result } = renderHook(() => useSsrmDataBinding(undefined));
    expect(result.current).toBeUndefined();
  });

  it('carries the provider, key column and quick-filter reader', () => {
    const getQuickFilterText = () => 'abc';
    const { result } = renderHook(() =>
      useSsrmDataBinding({ provider, keyColumn: 'positionId', getQuickFilterText }),
    );
    expect(result.current).toEqual({
      source: provider,
      keyColumn: 'positionId',
      getQuickFilterText,
    });
  });

  it('stays referentially stable while the provider does', () => {
    const ssrm = { provider, keyColumn: 'id' };
    const { result, rerender } = renderHook((p: MarketsGridSsrmProps) => useSsrmDataBinding(p), {
      initialProps: ssrm,
    });
    const first = result.current;
    // A new props object with the same members must not churn the binding —
    // a new binding re-attaches the adapter on every render otherwise.
    rerender({ provider, keyColumn: 'id' });
    expect(result.current).toBe(first);
  });

  it('produces a new binding when the provider is replaced', () => {
    const { result, rerender } = renderHook((p: MarketsGridSsrmProps) => useSsrmDataBinding(p), {
      initialProps: { provider },
    });
    const first = result.current;
    rerender({ provider: otherProvider });
    expect(result.current).not.toBe(first);
    expect(result.current?.source).toBe(otherProvider);
  });
});

describe('useSsrmDataBindingSync', () => {
  it('does not re-bind what the platform was constructed with', () => {
    const { platform, bindSsrm, unbindSsrm } = fakePlatform();
    const binding: SsrmDataBinding = { source: provider as never };
    renderHook(() => useSsrmDataBindingSync(platform, binding));
    expect(bindSsrm).not.toHaveBeenCalled();
    expect(unbindSsrm).not.toHaveBeenCalled();
  });

  it('binds when a provider arrives after mount', () => {
    const { platform, bindSsrm } = fakePlatform();
    const binding: SsrmDataBinding = { source: provider as never };
    const { rerender } = renderHook(
      ({ b }: { b: SsrmDataBinding | undefined }) => useSsrmDataBindingSync(platform, b),
      { initialProps: { b: undefined as SsrmDataBinding | undefined } },
    );
    rerender({ b: binding });
    expect(bindSsrm).toHaveBeenCalledWith(binding);
  });

  it('unbinds when the provider goes away', () => {
    const { platform, unbindSsrm } = fakePlatform();
    const binding: SsrmDataBinding = { source: provider as never };
    const { rerender } = renderHook(
      ({ b }: { b: SsrmDataBinding | undefined }) => useSsrmDataBindingSync(platform, b),
      { initialProps: { b: binding as SsrmDataBinding | undefined } },
    );
    rerender({ b: undefined });
    expect(unbindSsrm).toHaveBeenCalledTimes(1);
  });

  it('re-binds once per replacement, not once per render', () => {
    const { platform, bindSsrm } = fakePlatform();
    const first: SsrmDataBinding = { source: provider as never };
    const second: SsrmDataBinding = { source: otherProvider as never };
    const { rerender } = renderHook(
      ({ b }: { b: SsrmDataBinding }) => useSsrmDataBindingSync(platform, b),
      { initialProps: { b: first } },
    );
    rerender({ b: second });
    rerender({ b: second });
    rerender({ b: second });
    expect(bindSsrm).toHaveBeenCalledTimes(1);
    expect(bindSsrm).toHaveBeenCalledWith(second);
  });
});
