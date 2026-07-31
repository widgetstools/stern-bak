import { afterEach, describe, expect, it, vi } from 'vitest';
import { newDraftEntry } from './types.js';

const env = { appId: 'star-demo', configServiceUrl: 'https://cfg.example' };

afterEach(() => { vi.restoreAllMocks(); });

describe('newDraftEntry', () => {
  it('starts blank so the inspector form has nothing pre-filled', () => {
    const draft = newDraftEntry(env);

    expect(draft.hostUrl).toBe('');
    expect(draft.iconId).toBe('');
    expect(draft.componentType).toBe('');
    expect(draft.componentSubType).toBe('');
    expect(draft.configId).toBe('');
    expect(draft.displayName).toBe('New Component');
    expect(draft.singleton).toBe(false);
  });

  it('defaults to an internal component that uses the host config service', () => {
    const draft = newDraftEntry(env);

    expect(draft.type).toBe('internal');
    expect(draft.usesHostConfig).toBe(true);
    expect(draft.appId).toBe('star-demo');
    expect(draft.configServiceUrl).toBe('https://cfg.example');
  });

  it('mints a draft-prefixed id so nothing UUID-shaped can be mistaken for a saved entry', () => {
    const draft = newDraftEntry(env);

    // The prefix is what lets `save()` recognise a temp id and replace it
    // with the canonical `${type}-${subtype}` before anything reaches disk.
    expect(draft.id.startsWith('draft-')).toBe(true);
    expect(draft.id.length).toBeGreaterThan('draft-'.length);
  });

  it('gives each draft a distinct id so two "+ New" clicks do not collide', () => {
    expect(newDraftEntry(env).id).not.toBe(newDraftEntry(env).id);
  });

  it('still mints an id where crypto.randomUUID is unavailable', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      undefined as unknown as `${string}-${string}-${string}-${string}-${string}`,
    );
    // Older embedded webviews expose crypto without randomUUID; the entry
    // still needs a stable handle for the selection model.
    const draft = newDraftEntry(env);

    expect(draft.id.startsWith('draft-')).toBe(true);
  });

  it('stamps an ISO createdAt', () => {
    const draft = newDraftEntry(env);

    expect(new Date(draft.createdAt).toISOString()).toBe(draft.createdAt);
  });
});
