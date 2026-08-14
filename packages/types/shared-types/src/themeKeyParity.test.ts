import { describe, expect, it } from 'vitest';
import * as shared from './theme';
import * as root from '../../types/src/index';

/**
 * The theme storage key / broadcast channel are declared twice — once per
 * subpath build (`@wellsfargo-starui/types` and `.../types/shared`) because the
 * two tsconfig projects cannot share a source file. This test is the drift
 * guard: renaming one without the other silently splits the design-system's
 * theme persistence from every runtime port's.
 */
describe('theme key parity across the two subpath declarations', () => {
  it('THEME_STORAGE_KEY is byte-equal', () => {
    expect(root.THEME_STORAGE_KEY).toBe(shared.THEME_STORAGE_KEY);
  });
  it('THEME_BROADCAST_CHANNEL is byte-equal', () => {
    expect(root.THEME_BROADCAST_CHANNEL).toBe(shared.THEME_BROADCAST_CHANNEL);
  });
});
