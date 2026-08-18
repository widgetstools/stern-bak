import { describe, expect, it } from "vitest";
import { groupFieldOf, requestReadsAnyField } from "./queryColumnRefs.js";

const CALC = ["pnl", "spread"];

describe("groupFieldOf", () => {
  it("prefers the field AG Grid copied from the colDef", () => {
    expect(groupFieldOf({ id: "region", field: "region" })).toBe("region");
  });

  it("falls back to the id, which is all a calculated column has", () => {
    expect(groupFieldOf({ id: "pnl" })).toBe("pnl");
  });

  it("treats a blank field as absent", () => {
    expect(groupFieldOf({ id: "pnl", field: "" })).toBe("pnl");
  });

  it("answers empty when the column names itself neither way", () => {
    expect(groupFieldOf({})).toBe("");
  });
});

describe("requestReadsAnyField", () => {
  it("says no for a request that names nothing", () => {
    expect(requestReadsAnyField({}, CALC)).toBe(false);
  });

  it("says no when every named column is a plain stored one", () => {
    expect(
      requestReadsAnyField(
        {
          filterModel: { region: { filterType: "text", type: "equals", filter: "EMEA" } },
          sortModel: [{ colId: "qty", sort: "asc" }],
          rowGroupCols: [{ id: "region", field: "region" }],
          valueCols: [{ field: "qty", aggFunc: "sum" }],
          pivotCols: [{ field: "year" }],
        },
        CALC,
      ),
    ).toBe(false);
  });

  it("says nothing is read when the calculated set is empty", () => {
    expect(requestReadsAnyField({ sortModel: [{ colId: "pnl", sort: "asc" }] }, [])).toBe(false);
  });

  it("spots a calculated column in the filter model", () => {
    expect(
      requestReadsAnyField(
        { filterModel: { pnl: { filterType: "number", type: "greaterThan", filter: 0 } } },
        CALC,
      ),
    ).toBe(true);
  });

  it("spots a calculated column in the sort model", () => {
    expect(requestReadsAnyField({ sortModel: [{ colId: "spread", sort: "desc" }] }, CALC)).toBe(true);
  });

  it("spots a calculated group column that arrived with only an id", () => {
    // The case the `field || id` fallback exists for: AG Grid sends no field
    // for a column defined by colId alone.
    expect(requestReadsAnyField({ rowGroupCols: [{ id: "pnl" }] }, CALC)).toBe(true);
  });

  it("spots a calculated value column", () => {
    expect(requestReadsAnyField({ valueCols: [{ field: "pnl", aggFunc: "sum" }] }, CALC)).toBe(true);
  });

  it("ignores a fieldless value column", () => {
    expect(requestReadsAnyField({ valueCols: [{ field: "", aggFunc: "sum" }] }, CALC)).toBe(false);
  });

  it("spots a calculated pivot column", () => {
    expect(requestReadsAnyField({ pivotCols: [{ field: "spread" }] }, CALC)).toBe(true);
  });

  it("ignores a fieldless pivot column", () => {
    expect(requestReadsAnyField({ pivotCols: [{ field: "" }] }, CALC)).toBe(false);
  });

  it("treats an unscoped quick filter as reading everything", () => {
    // The client-side row model searches calculated columns through their
    // valueGetter, so an unscoped search here has to as well.
    expect(requestReadsAnyField({ quickFilterText: "AAPL" }, CALC)).toBe(true);
  });

  it("respects a quick filter scoped away from the calculated columns", () => {
    expect(
      requestReadsAnyField({ quickFilterText: "AAPL", quickFilterColumns: ["symbol"] }, CALC),
    ).toBe(false);
  });

  it("spots a calculated column inside a scoped quick filter", () => {
    expect(
      requestReadsAnyField(
        { quickFilterText: "AAPL", quickFilterColumns: ["symbol", "pnl"] },
        CALC,
      ),
    ).toBe(true);
  });

  it("ignores an empty quick filter even with no scope", () => {
    expect(requestReadsAnyField({ quickFilterText: "" }, CALC)).toBe(false);
  });

  it("scans an empty scope list without matching", () => {
    expect(requestReadsAnyField({ quickFilterText: "AAPL", quickFilterColumns: [] }, CALC)).toBe(
      false,
    );
  });
});
