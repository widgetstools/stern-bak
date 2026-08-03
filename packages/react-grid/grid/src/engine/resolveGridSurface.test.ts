/**
 * The one rule this resolver exists for: asking for Perspective can never
 * produce a client grid.
 *
 * A stand-in grid mounting during the async attach fires `onGridReady`,
 * activates every module, unmounts, and its `onGridPreDestroyed` destroys the
 * platform permanently — after which the real grid looks healthy while every
 * platform-driven feature is silently dead. Every case below is a way that
 * could happen if the resolver had one more branch.
 */

import { describe, expect, it } from 'vitest';
import { isPerspectiveRowModel, resolveGridSurface } from './resolveGridSurface';

describe('resolveGridSurface', () => {
  it('mounts the client surface when no row model is given', () => {
    expect(resolveGridSurface({})).toBe('client');
  });

  it('mounts the client surface for rowModel client', () => {
    expect(resolveGridSurface({ rowModel: 'client' })).toBe('client');
  });

  it('ignores a stray table when the row model is client', () => {
    expect(resolveGridSurface({ rowModel: 'client', perspectiveTable: {} })).toBe('client');
  });

  it('mounts the Perspective surface once the table has attached', () => {
    expect(resolveGridSurface({ rowModel: 'perspective', perspectiveTable: {} }))
      .toBe('perspective');
  });

  it('mounts NOTHING while the attach is in flight', () => {
    // `null` is what `usePerspectiveTable` reports while attaching.
    expect(resolveGridSurface({ rowModel: 'perspective', perspectiveTable: null }))
      .toBe('pending');
  });

  it('mounts NOTHING when the host wired no table at all', () => {
    // The dangerous case: indistinguishable from "still attaching" at this
    // seam, so it must resolve the same way. An empty surface is visible and
    // recoverable; a client grid on a soon-to-be-dead platform is neither.
    expect(resolveGridSurface({ rowModel: 'perspective' })).toBe('pending');
    expect(resolveGridSurface({ rowModel: 'perspective', perspectiveTable: undefined }))
      .toBe('pending');
  });

  it('never answers client for a perspective row model, whatever the table is', () => {
    for (const perspectiveTable of [null, undefined, 0, '', false, NaN]) {
      expect(resolveGridSurface({ rowModel: 'perspective', perspectiveTable }))
        .not.toBe('client');
    }
  });
});

describe('isPerspectiveRowModel', () => {
  it('is true only for the perspective row model', () => {
    expect(isPerspectiveRowModel('perspective')).toBe(true);
    expect(isPerspectiveRowModel('client')).toBe(false);
    expect(isPerspectiveRowModel(undefined)).toBe(false);
  });
});
