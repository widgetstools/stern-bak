import { describe, expect, it } from 'vitest';
import { serializeConfig } from './serializeConfig';

describe('serializeConfig', () => {
  it('pretty-prints plain objects with 2-space indent', () => {
    expect(serializeConfig({ a: 1, b: 'x' })).toBe('{\n  "a": 1,\n  "b": "x"\n}');
  });

  it('replaces functions with a stable [Function] marker', () => {
    const out = serializeConfig({ valueFormatter: () => 'x', field: 'mid' });
    expect(out).toContain('"valueFormatter": "[Function]"');
    expect(out).toContain('"field": "mid"');
  });

  it('drops undefined and renders nested arrays', () => {
    expect(serializeConfig({ cols: ['a', 'b'], skip: undefined })).toBe(
      '{\n  "cols": [\n    "a",\n    "b"\n  ]\n}',
    );
  });
});
