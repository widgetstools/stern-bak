import { describe, expect, it } from 'vitest';
import { SsrmServer } from './SsrmServer.js';

function server(maxInterestBlocks?: number) {
  return new SsrmServer({
    keyColumn: 'id',
    ...(maxInterestBlocks === undefined ? {} : { maxInterestBlocks }),
  });
}

describe('SsrmServer viewport interest', () => {
  it('keeps earlier blocks interested when a later block loads for the same query', () => {
    const s = server();
    // Block 0 loads, then the user scrolls and block 1 loads. AG Grid keeps
    // both blocks cached (maxBlocksInCache=20), so both must keep ticking.
    s.setViewportInterest('sess', ['1', '2'], { blockKey: 'b0', queryId: 'q1' });
    s.setViewportInterest('sess', ['3', '4'], { blockKey: 'b1', queryId: 'q1' });

    expect(s.interestedKeys('sess', ['1', '3']).sort()).toEqual(['1', '3']);
  });

  it('drops earlier interest when the query signature changes', () => {
    const s = server();
    s.setViewportInterest('sess', ['1', '2'], { blockKey: 'b0', queryId: 'q1' });
    // Filter changed -> new query -> block 0 of the *new* query matches nothing.
    s.setViewportInterest('sess', [], { blockKey: 'b0', queryId: 'q2' });

    expect(s.interestedKeys('sess', ['1', '2'])).toEqual([]);
  });

  it('evicts the least recently loaded block past the cache bound', () => {
    const s = server(2);
    s.setViewportInterest('sess', ['1'], { blockKey: 'b0', queryId: 'q1' });
    s.setViewportInterest('sess', ['2'], { blockKey: 'b1', queryId: 'q1' });
    s.setViewportInterest('sess', ['3'], { blockKey: 'b2', queryId: 'q1' });

    expect(s.interestedKeys('sess', ['1', '2', '3']).sort()).toEqual(['2', '3']);
  });

  it('treats a reloaded block as most recently used', () => {
    const s = server(2);
    s.setViewportInterest('sess', ['1'], { blockKey: 'b0', queryId: 'q1' });
    s.setViewportInterest('sess', ['2'], { blockKey: 'b1', queryId: 'q1' });
    s.setViewportInterest('sess', ['1'], { blockKey: 'b0', queryId: 'q1' });
    s.setViewportInterest('sess', ['3'], { blockKey: 'b2', queryId: 'q1' });

    // b1 was least recently touched, so it is the one evicted.
    expect(s.interestedKeys('sess', ['1', '2', '3']).sort()).toEqual(['1', '3']);
  });

  it('reports no interest for a session that has been cleared', () => {
    const s = server();
    s.setViewportInterest('sess', ['1'], { blockKey: 'b0', queryId: 'q1' });
    s.clearViewportInterest('sess');

    // Back to the uninitialised default: all changed keys are of interest.
    expect(s.interestedKeys('sess', ['1', '9'])).toEqual(['1', '9']);
  });

  it('still replaces interest wholesale when no block is identified', () => {
    const s = server();
    s.setViewportInterest('sess', ['1', '2']);
    s.setViewportInterest('sess', ['3']);

    expect(s.interestedKeys('sess', ['1', '3'])).toEqual(['3']);
  });
});
