/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { act, renderHook } from '@testing-library/react';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from './GridProvider';
import { useCapability, useCapabilityGate } from './useCapability';

/** Enough of the worker plane for the port to bind. Never called — what is
 *  under test is the capability the binding implies. */
const ssrmSource = () => ({
  source: {
    getRows: async () => ({ rowData: [], rowCount: 0 }),
    getSetFilterValues: async () => [],
    getStatusBar: async () => ({ totalRows: 0, filteredRows: 0, aggregations: [] }),
  },
});

function wrapper(platform: GridPlatform) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(GridProvider, { platform }, children);
  };
}

describe('useCapability', () => {
  it('reads the live verdict for the row model currently bound', () => {
    const platform = new GridPlatform({ gridId: 'cap-read', modules: [] });
    const { result } = renderHook(() => useCapability('canAddressUnloadedRows'), {
      wrapper: wrapper(platform),
    });
    expect(result.current.supported).toBe(true);
    expect(result.current.reason).toBe('');
    platform.destroy();
  });

  it('re-renders when a server-side source binds, and again when it detaches', () => {
    // The whole point of the getter, made true for React. A control disabled
    // while a provider was still binding has to enable itself when the answer
    // changes — otherwise the panel shows an answer from before the grid had
    // a source.
    const platform = new GridPlatform({ gridId: 'cap-live', modules: [] });
    const { result } = renderHook(() => useCapability('canAddressUnloadedRows'), {
      wrapper: wrapper(platform),
    });
    expect(result.current.supported).toBe(true);

    act(() => platform.data.bindSsrm(ssrmSource() as never));
    expect(result.current.supported).toBe(false);
    expect(result.current.reason).toMatch(/loads rows from the server/i);

    act(() => platform.data.unbindSsrm());
    expect(result.current.supported).toBe(true);
    platform.destroy();
  });

  it('answers "nothing is refused" outside a GridProvider', () => {
    // A surface rendered without the platform disables nothing: it has no
    // grounds to, and a control greyed out for want of context is a worse
    // lie than one that works.
    const { result } = renderHook(() => useCapability('mutationsReachSource'));
    expect(result.current).toEqual({ supported: true, reason: '' });
  });
});

describe('useCapabilityGate', () => {
  it('disables and carries the verdict copy when the capability is missing', () => {
    const platform = new GridPlatform({ gridId: 'gate-missing', modules: [] });
    platform.data.bindSsrm(ssrmSource() as never);
    const { result } = renderHook(() => useCapabilityGate('exportCoversFullDataset'), {
      wrapper: wrapper(platform),
    });
    expect(result.current.disabled).toBe(true);
    expect(result.current.reason).toMatch(/rows this grid has loaded/i);
    platform.destroy();
  });

  it('inverts for a control that only means something where the capability does NOT hold', () => {
    // A setting about rows that are not loaded is meaningless in a grid that
    // loads them all — and a supported verdict carries no copy by contract,
    // so the control supplies its own.
    const platform = new GridPlatform({ gridId: 'gate-inverted', modules: [] });
    const { result, rerender } = renderHook(
      () =>
        useCapabilityGate('canAddressUnloadedRows', {
          expect: false,
          reason: 'Only applies to a server-side grid.',
        }),
      { wrapper: wrapper(platform) },
    );
    expect(result.current).toEqual({
      disabled: true,
      reason: 'Only applies to a server-side grid.',
    });

    act(() => platform.data.bindSsrm(ssrmSource() as never));
    rerender();
    expect(result.current.disabled).toBe(false);
    platform.destroy();
  });
});
