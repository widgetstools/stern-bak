import { describe, expect, it } from 'vitest';
import {
  BULK_UPDATE_MODULE_ID,
  INITIAL_BULK_UPDATE,
} from '@wellsfargo-starui/core';
import { bulkUpdateModule } from './index';

describe('bulkUpdateModule', () => {
  it('registers with expected metadata', () => {
    expect(bulkUpdateModule.id).toBe(BULK_UPDATE_MODULE_ID);
    expect(bulkUpdateModule.code).toBe('07');
    expect(bulkUpdateModule.SettingsPanel).toBeTruthy();
  });

  it('getInitialState returns a clone', () => {
    const state = bulkUpdateModule.getInitialState();
    expect(state).toEqual(INITIAL_BULK_UPDATE);
    expect(state).not.toBe(INITIAL_BULK_UPDATE);
  });

  it('serialize / deserialize round-trip', () => {
    const state = bulkUpdateModule.getInitialState();
    const raw = bulkUpdateModule.serialize!(state);
    expect(bulkUpdateModule.deserialize!(raw)).toEqual(state);
  });
});
