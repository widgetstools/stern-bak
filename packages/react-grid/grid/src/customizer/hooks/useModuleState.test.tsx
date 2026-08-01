/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/engine';
import { GridProvider } from './GridProvider.js';
import { useModuleState } from './useModuleState.js';

interface DemoState {
  count: number;
}

const demoModule = {
  id: 'demo-module',
  getInitialState: (): DemoState => ({ count: 0 }),
  activate: () => () => {},
};

function wrap(platform: GridPlatform) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <GridProvider platform={platform}>{children}</GridProvider>;
  };
}

describe('useModuleState', () => {
  let platform: GridPlatform;

  beforeEach(() => {
    platform = new GridPlatform({ gridId: 'module-state-grid', modules: [demoModule] });
  });

  it('reads and updates module state via one-arg form', () => {
    const { result } = renderHook(() => useModuleState<DemoState>('demo-module'), {
      wrapper: wrap(platform),
    });
    expect(result.current[0].count).toBe(0);
    act(() => {
      result.current[1]((prev) => ({ count: prev.count + 1 }));
    });
    expect(result.current[0].count).toBe(1);
  });

  it('accepts store + moduleId two-arg form for v2 compatibility', () => {
    const { result } = renderHook(
      () => useModuleState<DemoState>(platform.store, 'demo-module'),
      { wrapper: wrap(platform) },
    );
    act(() => {
      result.current[1](() => ({ count: 5 }));
    });
    expect(result.current[0].count).toBe(5);
  });
});
