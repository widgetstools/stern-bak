import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('./MarketsGridSurface.js', () => ({
  MarketsGridSurface: () => <div data-testid="csrm-surface" />,
}));
vi.mock('./MarketsGridSsrmSurface.js', () => ({
  MarketsGridSsrmSurface: () => <div data-testid="ssrm-surface" />,
}));
// Mock heavy host chrome deps as needed (controller, toolbars) — prefer
// rendering MarketsGridHost with the minimum props if exports allow,
// otherwise test a tiny exported helper `resolveMarketsGridSurfaceKind(props)`.

import { resolveMarketsGridSurfaceKind } from './MarketsGridHost.js';

describe('resolveMarketsGridSurfaceKind', () => {
  it('selects ssrm when ssrm.provider set', () => {
    expect(
      resolveMarketsGridSurfaceKind({
        ssrm: { provider: { id: 'x' } as never },
      }),
    ).toBe('ssrm');
  });
  it('selects csrm otherwise', () => {
    expect(resolveMarketsGridSurfaceKind({ rowData: [] })).toBe('csrm');
  });
});
