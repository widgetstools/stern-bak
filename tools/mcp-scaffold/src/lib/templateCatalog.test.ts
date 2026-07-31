import { describe, it, expect } from 'vitest';
import { listTemplates } from '../lib/templateCatalog.js';

describe('listTemplates', () => {
  it('returns five templates', () => {
    const result = listTemplates();
    expect(result).toHaveLength(5);
    expect(result.map((t) => t.id)).toContain('openfin-platform');
  });
});
