import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetWorkerBootstrapPayloadForTests,
  appNameFromWorkerName,
  readWorkerBootstrapPayload,
  writeWorkerBootstrapPayload,
} from './workerBootstrapPayload.js';

describe('workerBootstrapPayload', () => {
  afterEach(() => {
    _resetWorkerBootstrapPayloadForTests();
    localStorage.clear();
  });

  it('round-trips bootstrap fields via localStorage', () => {
    writeWorkerBootstrapPayload('Star-Demo', {
      appId: 'Star-Demo',
      userId: 'k151344',
      seedConfigUrl: '/seed.json',
      configServiceRestUrl: 'http://localhost:3001/api/v1',
    });

    expect(readWorkerBootstrapPayload('Star-Demo')).toEqual({
      appId: 'Star-Demo',
      userId: 'k151344',
      seedConfigUrl: '/seed.json',
      seedConfigReload: undefined,
      configServiceRestUrl: 'http://localhost:3001/api/v1',
    });
  });

  it('parses appName from SharedWorker name', () => {
    expect(appNameFromWorkerName('mkt-data-services:Star-Demo')).toBe('Star-Demo');
    expect(appNameFromWorkerName('other')).toBeNull();
  });
});
