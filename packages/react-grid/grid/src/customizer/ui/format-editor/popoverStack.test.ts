import { describe, expect, it } from 'vitest';
import {
  clickIsInsideAnyOpenPopover,
  registerPopoverRoot,
} from './popoverStack';

describe('popoverStack', () => {
  it('registers and unregisters popover roots', () => {
    const el = document.createElement('div');
    const child = document.createElement('span');
    el.appendChild(child);
    document.body.appendChild(el);

    const dispose = registerPopoverRoot(el);
    expect(clickIsInsideAnyOpenPopover(child)).toBe(true);

    dispose();
    expect(clickIsInsideAnyOpenPopover(child)).toBe(false);

    document.body.removeChild(el);
  });

  it('returns false for nodes outside any registered root', () => {
    const outsider = document.createElement('div');
    document.body.appendChild(outsider);
    expect(clickIsInsideAnyOpenPopover(outsider)).toBe(false);
    document.body.removeChild(outsider);
  });

  it('matches clicks inside any registered root when multiple are open', () => {
    const rootA = document.createElement('div');
    const rootB = document.createElement('div');
    const targetB = document.createElement('span');
    rootB.appendChild(targetB);
    document.body.append(rootA, rootB);

    const offA = registerPopoverRoot(rootA);
    const offB = registerPopoverRoot(rootB);

    expect(clickIsInsideAnyOpenPopover(targetB)).toBe(true);

    offA();
    offB();
    rootA.remove();
    rootB.remove();
  });
});
