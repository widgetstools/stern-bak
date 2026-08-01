import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from './index';

describe('ExpressionEngine nested dotted column references', () => {
  const engine = new ExpressionEngine();

  it('parses and evaluates bracketed nested fields with numeric-leading path segments', () => {
    const context = {
      x: null,
      value: null,
      data: {
        analytics: {
          keyRateDuration: {
            '3Y': 7.25,
          },
        },
      },
      columns: {},
    };

    expect(
      engine.parseAndEvaluate('[analytics.keyRateDuration.3Y]', context),
    ).toBe(7.25);
  });

  it('prefers a flat literal key before dot-walking nested data', () => {
    const context = {
      x: null,
      value: null,
      data: {
        'analytics.keyRateDuration.3Y': 8.5,
        analytics: {
          keyRateDuration: {
            '3Y': 7.25,
          },
        },
      },
      columns: {},
    };

    expect(
      engine.parseAndEvaluate('[analytics.keyRateDuration.3Y]', context),
    ).toBe(8.5);
  });

  it('uses the same dotted nested path support for aggregations', () => {
    const context = {
      x: null,
      value: null,
      data: {},
      columns: {},
      allRows: [
        { analytics: { keyRateDuration: { '3Y': 1.5 } } },
        { analytics: { keyRateDuration: { '3Y': 2.25 } } },
      ],
    };

    expect(
      engine.parseAndEvaluate('SUM([analytics.keyRateDuration.3Y])', context),
    ).toBe(3.75);
  });

  it('keeps bracketed comma lists as array literals rather than column refs', () => {
    const context = {
      x: null,
      value: null,
      data: {},
      columns: {},
    };

    expect(engine.parseAndEvaluate('[1, 2, 3]', context)).toEqual([1, 2, 3]);
  });

  it('accepts lowercase `in` for membership tests', () => {
    const context = {
      x: null,
      value: null,
      data: { compositeRating: 'BB' },
      columns: {},
    };

    expect(
      engine.parseAndEvaluate(
        "data.compositeRating in ['BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC']",
        context,
      ),
    ).toBe(true);
    expect(
      engine.parseAndEvaluate(
        "data.compositeRating in ['BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC']",
        { ...context, data: { compositeRating: 'AAA' } },
      ),
    ).toBe(false);
  });
});
