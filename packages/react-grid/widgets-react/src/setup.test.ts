import { describe, expect, it } from 'vitest';
import {
  createStarui,
  useStaruiIdentity,
  StaruiIdentityProvider,
  DataHubProvider,
  applyTheme,
  getTheme,
  StarGrid,
} from './index.js';

describe('grid root re-exports (Phase 8a)', () => {
  it('exports the one-call bootstrap and theming helpers', () => {
    expect(typeof createStarui).toBe('function');
    expect(typeof useStaruiIdentity).toBe('function');
    expect(typeof StaruiIdentityProvider).toBe('function');
    expect(typeof DataHubProvider).toBe('function');
    expect(typeof applyTheme).toBe('function');
    expect(typeof getTheme).toBe('function');
    expect(typeof StarGrid).toBe('function');
  });
});
