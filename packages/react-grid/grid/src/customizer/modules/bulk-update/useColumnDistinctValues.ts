/**
 * The distinct values offered in the bulk-update dropdown, read through
 * `platform.data`.
 *
 * WHAT WAS WRONG — the old reader looped `getDisplayedRowCount()` calling
 * `getDisplayedRowAtIndex(i)`. That pairing only holds under the client-side
 * row model. Under the server-side one the count is the SERVER's total while
 * every index outside the loaded block window resolves to a loading stub, so
 * the loop asked for a hundred thousand rows, got a couple of thousand, and
 * built a "distinct values" list out of whichever block happened to be
 * scrolled into view. Not empty, not obviously broken — just quietly wrong,
 * and different after every scroll.
 *
 * The port answers from whatever holds the rows: `forEachNode` over the
 * client-side model, `getSetFilterValues` over the worker's whole store. The
 * `limit` goes down with the request so neither side pages more than the
 * dropdown can show.
 *
 * TWO THINGS THE ASYNC ANSWER BRINGS WITH IT:
 *  - Every port method may cross `postMessage`, so a list can arrive after
 *    the selection that asked for it has moved on. Each read is stamped and a
 *    late answer to a superseded question is dropped — the same generation
 *    discipline the filter-pill badges use.
 *  - `complete: false` means the port could not look, not that the column has
 *    no values. A partial list presented as the column's values is the same
 *    class of lie the old walk told, so it yields nothing instead.
 */
import { useEffect, useRef, useState } from 'react';
import { compareDistinctValues, type GridDataPort } from '@wellsfargo-starui/core';

export interface ColumnDistinctValues {
  readonly values: readonly unknown[];
  /**
   * The source could only supply string projections (the worker's
   * `getSetFilterValues` returns `string[]`). The dropdown writes its choice
   * into a text field either way, so this exists for callers that type the
   * value rather than display it.
   */
  readonly stringProjected: boolean;
}

const NONE: ColumnDistinctValues = { values: [], stringProjected: false };

export function useColumnDistinctValues(
  data: GridDataPort,
  colId: string | undefined,
  limit: number,
  enabled: boolean,
): ColumnDistinctValues {
  const [result, setResult] = useState<ColumnDistinctValues>(NONE);
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    if (!enabled || !colId) {
      setResult(NONE);
      return;
    }
    void data
      // `scope: 'filtered'` — the values in the rows the user is looking at,
      // which is what the dropdown has always meant.
      .distinct(colId, { query: { scope: 'filtered' }, limit })
      .then(({ values, stringProjected, complete }) => {
        if (gen !== generation.current) return;
        setResult(
          complete
            ? { values: [...values].sort(compareDistinctValues), stringProjected }
            : NONE,
        );
      });
    return () => {
      // Nothing to abort — bumping the generation is what makes the in-flight
      // answer land nowhere.
      generation.current += 1;
    };
  }, [data, colId, limit, enabled]);

  return result;
}
