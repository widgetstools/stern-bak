import { describe, expect, it } from 'vitest';
import { ExternalFilterColumnRegistry } from './ExternalFilterColumnRegistry';

describe('ExternalFilterColumnRegistry', () => {
  it('reports null until someone declares, then the union of declarations', () => {
    const r = new ExternalFilterColumnRegistry();
    expect(r.columns()).toBeNull();
    r.declare('a', ['ccy', 'notional']);
    expect(r.columns()).toEqual(['ccy', 'notional']);
    r.declare('b', ['notional', 'desk']);
    expect(r.columns()).toEqual(['ccy', 'notional', 'desk']);
  });

  it('an empty declaration attributes the filter to no column at all', () => {
    const r = new ExternalFilterColumnRegistry();
    r.declare('row-ids', []);
    expect(r.columns()).toEqual([]);
  });

  it('replaces an owner\'s declaration, withdraws on null, forgets everything on clear', () => {
    const r = new ExternalFilterColumnRegistry();
    r.declare('a', ['ccy', 'ccy']);
    expect(r.columns()).toEqual(['ccy']);
    r.declare('a', ['desk']);
    expect(r.columns()).toEqual(['desk']);
    r.declare('a', null);
    expect(r.columns()).toBeNull();
    r.declare('a', ['x']);
    r.clear();
    expect(r.columns()).toBeNull();
  });
});
