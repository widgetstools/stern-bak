import { describe, expect, it } from 'vitest';
import { cn } from './utils.js';

/**
 * `cn` is the class-name helper every component in this package uses. It is
 * clsx (conditional joining) composed with tailwind-merge (later Tailwind
 * utility wins over an earlier conflicting one), and the merge behaviour is the
 * part worth pinning — it is what lets a caller override a component's default
 * padding or colour via className.
 */
describe('cn', () => {
  it('joins plain class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('supports conditional object syntax', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });

  it('flattens arrays', () => {
    expect(cn(['a', ['b', 'c']])).toBe('a b c');
  });

  it('lets a later Tailwind utility win over an earlier conflicting one', () => {
    // The reason tailwind-merge is here: a caller's className must be able to
    // override a component default.
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('keeps non-conflicting utilities side by side', () => {
    expect(cn('px-2', 'py-4')).toBe('px-2 py-4');
  });

  it('resolves conflicts across a conditional override', () => {
    expect(cn('p-2', { 'p-8': true })).toBe('p-8');
  });

  it('returns an empty string for no input', () => {
    expect(cn()).toBe('');
  });
});
