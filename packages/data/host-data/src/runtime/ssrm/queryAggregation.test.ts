import { describe, expect, it } from "vitest";
import {
  aggregateValueCols,
  collectPivotResultFields,
  pivotAggregate,
} from "./queryAggregation.js";
import type { Row } from "./types.js";

const SEP = "_";

const rows: Row[] = [
  { region: "EMEA", year: 2025, qty: 10, px: 1 },
  { region: "EMEA", year: 2026, qty: 20, px: 2 },
  { region: "APAC", year: 2025, qty: 30, px: 4 },
  { region: "APAC", year: 2025, qty: 40, px: 8 },
];

describe("aggregateValueCols", () => {
  it("folds each declared value column over the rows", () => {
    expect(
      aggregateValueCols(rows, [
        { field: "qty", aggFunc: "sum" },
        { field: "px", aggFunc: "max" },
      ]),
    ).toEqual({ qty: 100, px: 8 });
  });

  it("returns nothing when the request declares no value columns", () => {
    // A plain leaf block pays no aggregation cost at all — that is the point
    // of the early return, not just a convenience.
    expect(aggregateValueCols(rows, [])).toEqual({});
    expect(aggregateValueCols(rows, undefined)).toEqual({});
  });

  it("ignores value columns with no field", () => {
    expect(
      aggregateValueCols(rows, [{ field: "", aggFunc: "sum" }, { field: "qty", aggFunc: "sum" }]),
    ).toEqual({ qty: 100 });
  });

  it("returns nothing when every declared column is fieldless", () => {
    expect(aggregateValueCols(rows, [{ field: "", aggFunc: "sum" }])).toEqual({});
  });

  it("resolves an unnamed agg func rather than dropping the column", () => {
    const out = aggregateValueCols(rows, [{ field: "qty" } as { field: string }]);
    expect(Object.keys(out)).toEqual(["qty"]);
  });
});

describe("collectPivotResultFields", () => {
  it("crosses every pivot key with every value column, keys sorted", () => {
    expect(
      collectPivotResultFields(rows, [{ field: "region" }], [{ field: "qty", aggFunc: "sum" }], SEP),
    ).toEqual(["APAC_qty", "EMEA_qty"]);
  });

  it("joins multiple pivot columns into one composite key", () => {
    expect(
      collectPivotResultFields(
        rows,
        [{ field: "region" }, { field: "year" }],
        [{ field: "qty", aggFunc: "sum" }],
        SEP,
      ),
    ).toEqual(["APAC_2025_qty", "EMEA_2025_qty", "EMEA_2026_qty"]);
  });

  it("emits one field per value column per key", () => {
    expect(
      collectPivotResultFields(
        rows,
        [{ field: "region" }],
        [{ field: "qty", aggFunc: "sum" }, { field: "px", aggFunc: "sum" }],
        SEP,
      ),
    ).toEqual(["APAC_qty", "APAC_px", "EMEA_qty", "EMEA_px"]);
  });

  it("reads through a dotted pivot field", () => {
    const nested: Row[] = [{ book: { desk: "rates" } }, { book: { desk: "credit" } }];
    expect(
      collectPivotResultFields(nested, [{ field: "book.desk" }], [{ field: "qty" }], SEP),
    ).toEqual(["credit_qty", "rates_qty"]);
  });

  it("reads a missing pivot value as the empty key", () => {
    expect(
      collectPivotResultFields([{ qty: 1 }], [{ field: "region" }], [{ field: "qty" }], SEP),
    ).toEqual(["_qty"]);
  });

  it("produces nothing without both a pivot column and a value column", () => {
    expect(collectPivotResultFields(rows, [], [{ field: "qty" }], SEP)).toEqual([]);
    expect(collectPivotResultFields(rows, [{ field: "region" }], [], SEP)).toEqual([]);
    expect(collectPivotResultFields(rows, [{ field: "region" }], undefined, SEP)).toEqual([]);
  });

  it("skips a fieldless value column", () => {
    expect(
      collectPivotResultFields(
        rows,
        [{ field: "region" }],
        [{ field: "" }, { field: "qty" }],
        SEP,
      ),
    ).toEqual(["APAC_qty", "EMEA_qty"]);
  });
});

describe("pivotAggregate", () => {
  it("buckets rows by pivot key and folds each bucket", () => {
    expect(
      pivotAggregate(rows, [{ field: "region" }], [{ field: "qty", aggFunc: "sum" }], SEP),
    ).toEqual({ EMEA_qty: 30, APAC_qty: 70 });
  });

  it("keys on the full composite when several pivot columns are in play", () => {
    expect(
      pivotAggregate(
        rows,
        [{ field: "region" }, { field: "year" }],
        [{ field: "qty", aggFunc: "sum" }],
        SEP,
      ),
    ).toEqual({ EMEA_2025_qty: 10, EMEA_2026_qty: 20, APAC_2025_qty: 70 });
  });

  it("degrades to a plain fold when nothing is pivoted", () => {
    expect(pivotAggregate(rows, [], [{ field: "qty", aggFunc: "sum" }], SEP)).toEqual({ qty: 100 });
  });

  it("produces no secondary fields when there is nothing to aggregate", () => {
    expect(pivotAggregate(rows, [{ field: "region" }], [], SEP)).toEqual({});
  });

  it("returns nothing for an empty row set", () => {
    expect(pivotAggregate([], [{ field: "region" }], [{ field: "qty" }], SEP)).toEqual({});
  });

  it("carries every value column into each bucket", () => {
    expect(
      pivotAggregate(
        rows,
        [{ field: "region" }],
        [{ field: "qty", aggFunc: "sum" }, { field: "px", aggFunc: "max" }],
        SEP,
      ),
    ).toEqual({ EMEA_qty: 30, EMEA_px: 2, APAC_qty: 70, APAC_px: 8 });
  });
});
