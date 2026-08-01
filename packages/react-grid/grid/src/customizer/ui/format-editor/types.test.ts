import { describe, expect, it } from 'vitest';
import {
  EDGE_ORDER,
  defaultSideSpec,
  makeDefaultSides,
} from './types';

describe('format-editor types', () => {
  it('makeDefaultSides clones defaultSideSpec for every edge', () => {
    const sides = makeDefaultSides();
    for (const edge of EDGE_ORDER) {
      expect(sides[edge]).toEqual(defaultSideSpec);
      expect(sides[edge]).not.toBe(defaultSideSpec);
    }
  });

  it('EDGE_ORDER is clockwise from top', () => {
    expect(EDGE_ORDER).toEqual(['top', 'right', 'bottom', 'left']);
  });
});
