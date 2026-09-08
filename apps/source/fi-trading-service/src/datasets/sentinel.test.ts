import { describe, expect, it } from 'vitest';
import { assertNoSentinelCollision } from './sentinel.js';

describe('assertNoSentinelCollision', () => {
  it('passes a book with no collision', () => {
    expect(() =>
      assertNoSentinelCollision([{ description: 'US TREASURY NOTE', price: 99.5 }], ['success']),
    ).not.toThrow();
  });

  it('catches a token embedded in a longer word, because the client matches substrings', () => {
    expect(() => assertNoSentinelCollision([{ orderState: 'PartialSuccess' }], ['Success']))
      .toThrow(/orderState/);
  });

  it('is case insensitive in both directions', () => {
    expect(() => assertNoSentinelCollision([{ note: 'SUCCESS' }], ['success'])).toThrow();
    expect(() => assertNoSentinelCollision([{ note: 'success' }], ['SUCCESS'])).toThrow();
  });

  it('names the offending field and value so the fix is obvious', () => {
    expect(() => assertNoSentinelCollision([{ strategy: 'Rate Success' }], ['success']))
      .toThrow(/'strategy' value "Rate Success"/);
  });

  it('ignores non-string values rather than stringifying them', () => {
    expect(() => assertNoSentinelCollision([{ n: 1, b: true, o: null, u: undefined }], ['success']))
      .not.toThrow();
  });

  it('checks every token against every row', () => {
    expect(() => assertNoSentinelCollision(
      [{ a: 'fine' }, { b: 'END_OF_SNAPSHOT' }], ['success', 'end_of_snapshot'],
    )).toThrow(/'b'/);
  });
});
