import { describe, expect, it } from 'vitest';
import { gridHandlerMeta } from './hooksMeta.js';

describe('gridHandlerMeta', () => {
  it('documents log-profile-saved handler', () => {
    expect(gridHandlerMeta['log-profile-saved']).toEqual({
      label: 'Log profile save',
      description: 'Writes profile:saved payload to the console.',
    });
  });

  it('documents alert-provider-error handler', () => {
    expect(gridHandlerMeta['alert-provider-error']).toEqual({
      label: 'Warn on provider error',
      description: 'Logs provider:status errors to the console.',
    });
  });
});
