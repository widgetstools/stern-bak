/**
 * Two Table-hosting providers in one worker must not name their Tables the
 * same thing.
 *
 * `StompPerspectiveProviderConfig.tableName` has always documented "defaults
 * to the provider id, which is what makes one Table per provider" — but a
 * transport is handed a cfg and never an id, so its own fallback is the
 * literal `'positions'`. Any app running two Perspective providers therefore
 * had both hosting `'positions'` in the same worker, and what
 * `open_table('positions')` returned stopped being knowable.
 *
 * Found by running markets-grid-lab: one tab's Perspective grid worked, and
 * opening a second tab's broke it with "has not built its Perspective Table
 * yet" — a message about the wrong thing entirely.
 */
import { describe, expect, it } from 'vitest';
import type { MockPerspectiveProviderConfig } from '@wellsfargo-starui/types';
import { startProvider } from '../registry.js';
import type { PerspectiveHost } from '../../perspective/perspectiveHost.js';

/** Records which names Tables were requested under. */
function recordingHost() {
  const names: string[] = [];
  const host = {
    tableFactoryFor: (name: string) => {
      names.push(name);
      return async () => ({
        update: async () => {},
        delete: async () => {},
        size: async () => 0,
        clear: async () => {},
      });
    },
  } as unknown as PerspectiveHost;
  return { names, host };
}

function cfg(overrides: Partial<MockPerspectiveProviderConfig> = {}): MockPerspectiveProviderConfig {
  return {
    providerType: 'mock-perspective',
    dataType: 'positions',
    rowCount: 5,
    enableUpdates: false,
    keyColumn: 'id',
    rowShape: 'flat',
    columnDefinitions: [
      { field: 'id', headerName: 'Id', cellDataType: 'text' },
      { field: 'cusip', headerName: 'CUSIP', cellDataType: 'text' },
    ],
    ...overrides,
  };
}

describe('perspective Table naming', () => {
  it('names each provider’s Table after the provider', async () => {
    const { names, host } = recordingHost();

    const a = startProvider(cfg(), () => {}, {
      perspectiveHost: host,
      tableName: 'lab:positions-live',
    });
    const b = startProvider(cfg(), () => {}, {
      perspectiveHost: host,
      tableName: 'lab:positions-stress',
    });

    expect(names).toEqual(['lab:positions-live', 'lab:positions-stress']);
    expect(new Set(names).size).toBe(2);

    await a.stop();
    await b.stop();
  });

  it('lets an explicit cfg.tableName win over the provider id', async () => {
    const { names, host } = recordingHost();

    const handle = startProvider(cfg({ tableName: 'authored' }), () => {}, {
      perspectiveHost: host,
      tableName: 'lab:positions-live',
    });

    expect(names).toEqual(['authored']);
    await handle.stop();
  });

  // Without the hub's id the transports fall back to one shared literal, which
  // is the collision this exists to prevent.
  it('still falls back to a shared literal when nothing supplies a name', async () => {
    const { names, host } = recordingHost();

    const a = startProvider(cfg(), () => {}, { perspectiveHost: host });
    const b = startProvider(cfg(), () => {}, { perspectiveHost: host });

    expect(names).toEqual(['positions', 'positions']);
    await a.stop();
    await b.stop();
  });
});
