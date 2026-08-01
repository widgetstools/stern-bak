import { describe, expect, it } from 'vitest';
import { orderStatusColor } from './orderStatus';

describe('orderStatusColor', () => {
  it('returns token colors for each status', () => {
    expect(orderStatusColor('filled')).toContain('positive');
    expect(orderStatusColor('partial')).toContain('warning');
    expect(orderStatusColor('pending')).toContain('info');
    expect(orderStatusColor('cancelled')).toContain('negative');
  });
});
