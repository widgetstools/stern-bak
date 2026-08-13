import { describe, expect, it, vi } from 'vitest';
import { CATALOGS, writeLabProfileJsonFiles } from './writeLabProfileJson';

describe('writeLabProfileJson', () => {
  it('writes profile json for every catalog entry', () => {
    const mkdir = vi.fn();
    const write = vi.fn();
    const log = vi.fn();

    const count = writeLabProfileJsonFiles({
      outRoot: '/tmp/lab-profiles',
      mkdir,
      write,
      log,
    });

    expect(count).toBeGreaterThan(50);
    expect(mkdir).toHaveBeenCalled();
    expect(write).toHaveBeenCalled();
    expect(CATALOGS.length).toBeGreaterThan(10);
    expect(log).toHaveBeenCalled();
  });
});
