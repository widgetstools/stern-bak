import { describe, expect, it, vi } from 'vitest';
import { writeAlertProfileJsonFiles } from './writeAlertProfileJson';
import { ALERT_DEMO_PROFILES } from '../src/profiles/alertDemoCatalog';

describe('writeAlertProfileJson', () => {
  it('writes alert profile json files', () => {
    const mkdir = vi.fn();
    const write = vi.fn();
    const log = vi.fn();

    const count = writeAlertProfileJsonFiles({
      outDir: '/tmp/alert-profiles',
      mkdir,
      write,
      log,
    });

    expect(count).toBe(ALERT_DEMO_PROFILES.length);
    expect(mkdir).toHaveBeenCalledWith('/tmp/alert-profiles', { recursive: true });
    expect(write).toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });
});
