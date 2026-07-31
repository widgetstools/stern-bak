import { describe, expect, it } from 'vitest';
import { enableCrossRealmNodeInstanceOf } from './crossRealmNodeInstanceOf';

describe('enableCrossRealmNodeInstanceOf', () => {
  it('keeps same-realm nodes passing instanceof Node', () => {
    enableCrossRealmNodeInstanceOf();
    expect(document.createElement('div') instanceof Node).toBe(true);
  });

  it('treats a foreign-realm element (nodeType 1) as a Node', () => {
    enableCrossRealmNodeInstanceOf();
    const foreign = { nodeType: 1, tagName: 'DIV' } as unknown;
    expect(foreign instanceof Node).toBe(true);
  });

  it('does NOT match cross-realm non-elements (Document/text) via the fallback', () => {
    enableCrossRealmNodeInstanceOf();
    // A bare {nodeType:9} stand-in for a foreign Document must not pass —
    // otherwise consumers call element-only methods on a non-element.
    expect(({ nodeType: 9 } as unknown) instanceof Node).toBe(false);
    expect(({ nodeType: 3 } as unknown) instanceof Node).toBe(false);
  });

  it('still rejects non-nodes', () => {
    enableCrossRealmNodeInstanceOf();
    expect(({} as unknown) instanceof Node).toBe(false);
    expect((null as unknown) instanceof Node).toBe(false);
    expect(('text' as unknown) instanceof Node).toBe(false);
  });
});
