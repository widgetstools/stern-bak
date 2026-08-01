import { describe, expect, it } from 'vitest';
import {
  getElementDomContext,
  getPortalDomContext,
} from './editorDom';

describe('editorDom', () => {
  it('getElementDomContext resolves owner document', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const ctx = getElementDomContext(el);
    expect(ctx?.document).toBe(document);
    expect(ctx?.window).toBe(window);
    document.body.removeChild(el);
  });

  it('getElementDomContext returns null for null element', () => {
    expect(getElementDomContext(null)).toBeNull();
  });

  it('getPortalDomContext falls back to main document', () => {
    const ctx = getPortalDomContext(undefined);
    expect(ctx.document).toBe(document);
  });

  it('getPortalDomContext uses container ownerDocument', () => {
    const el = document.createElement('div');
    const ctx = getPortalDomContext(el);
    expect(ctx.document).toBe(document);
  });
});
