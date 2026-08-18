/**
 * `RowStore.characterization.test.ts` pins the ingest behaviour the query
 * engine depends on. This file covers the rest of the surface — projection,
 * the quick-filter cache, listener isolation, and the read helpers the engine
 * scans through.
 */
import { describe, expect, it, vi } from "vitest";
import { RowStore } from "./RowStore.js";
import type { TickEvent } from "./types.js";

const store = (opts: Partial<ConstructorParameters<typeof RowStore>[0]> = {}) =>
  new RowStore({ keyColumn: "id", ...opts });

/** Collect every tick a store emits. */
function ticks(s: RowStore) {
  const seen: TickEvent[] = [];
  const off = s.onTick((e) => seen.push(e));
  return { seen, off };
}

describe("subscription", () => {
  it("delivers ticks until the listener unsubscribes", () => {
    const s = store();
    const { seen, off } = ticks(s);
    s.upsert([{ id: "1" }]);
    off();
    s.upsert([{ id: "2" }]);

    expect(seen).toHaveLength(1);
  });

  it("stamps every tick with the revision it belongs to", () => {
    const s = store();
    const { seen } = ticks(s);
    s.upsert([{ id: "1" }]);
    s.upsert([{ id: "2" }]);

    expect(seen.map((e) => e.revision)).toEqual([1, 2]);
  });

  it("keeps delivering to later listeners when an earlier one throws", () => {
    const s = store();
    const reached: string[] = [];
    s.onTick(() => {
      throw new Error("consumer blew up");
    });
    s.onTick(() => reached.push("second"));

    expect(() => s.upsert([{ id: "1" }])).not.toThrow();
    // The windowed flush every session rides on registers after other
    // consumers; an aborted loop silently stopped it.
    expect(reached).toEqual(["second"]);
  });
});

describe("projection", () => {
  it("keeps every field when no allow-list is configured", () => {
    const s = store();
    s.upsert([{ id: "1", qty: 5, note: "x" }]);

    expect(s.getRow("1")).toEqual({ id: "1", qty: 5, note: "x" });
  });

  it("keeps only the allow-listed fields", () => {
    const s = store({ projectFields: ["qty"] });
    s.upsert([{ id: "1", qty: 5, note: "dropped" }]);

    expect(s.getRow("1")).toEqual({ id: "1", qty: 5 });
  });

  it("does not invent an allow-listed field the row never carried", () => {
    const s = store({ projectFields: ["qty", "absent"] });
    s.upsert([{ id: "1", qty: 5 }]);

    expect(s.getRow("1")).not.toHaveProperty("absent");
  });

  it("always keeps the key column, allow-listed or not", () => {
    const s = store({ projectFields: ["qty"] });
    s.upsert([{ id: "1", qty: 5 }]);

    expect(s.getRow("1")).toMatchObject({ id: "1" });
  });

  it("stores nothing for a projected row with no key", () => {
    const s = store({ projectFields: ["qty"] });
    s.upsert([{ qty: 5 }]);

    expect(s.size).toBe(0);
  });
});

describe("snapshot", () => {
  it("replaces every row and emits one snapshot tick", () => {
    const s = store();
    s.upsert([{ id: "1" }]);
    const { seen } = ticks(s);
    s.replaceSnapshot([{ id: "9", qty: 1 }]);

    expect(s.getKeys()).toEqual(["9"]);
    expect(seen).toEqual([{ type: "snapshot", revision: 2 }]);
  });

  it("skips snapshot rows that carry no key", () => {
    const s = store();
    s.replaceSnapshot([{ id: "1" }, { qty: 5 }, { id: null }]);

    expect(s.size).toBe(1);
  });

  it("forgets columns the previous snapshot had", () => {
    const s = store();
    s.replaceSnapshot([{ id: "1", legacy: 1 }]);
    s.replaceSnapshot([{ id: "1", modern: 1 }]);

    expect(s.getStats().columns.sort()).toEqual(["id", "modern"]);
  });

  it("clear() empties everything and bumps the revision", () => {
    const s = store();
    s.replaceSnapshot([{ id: "1", qty: 1 }]);
    const { seen } = ticks(s);
    s.clear();

    expect(s.size).toBe(0);
    expect(s.getStats().columns).toEqual([]);
    expect(s.getQuickFilterText("1")).toBe("");
    expect(seen).toEqual([{ type: "snapshot", revision: 2 }]);
  });
});

describe("upsert", () => {
  it("emits nothing for an empty batch", () => {
    const s = store();
    const { seen } = ticks(s);
    s.upsert([]);

    expect(seen).toEqual([]);
    expect(s.getRevision()).toBe(0);
  });

  it("emits nothing when every row in the batch is unkeyed", () => {
    const s = store();
    const { seen } = ticks(s);
    s.upsert([{ qty: 1 }, { id: undefined }]);

    expect(seen).toEqual([]);
  });

  it("reports the changed keys, columns and rows", () => {
    const s = store();
    const { seen } = ticks(s);
    s.upsert([{ id: "1", qty: 5 }]);

    expect(seen[0]).toMatchObject({
      type: "rows",
      keys: ["1"],
      rows: [{ id: "1", qty: 5 }],
    });
    expect((seen[0] as { columns: string[] }).columns.sort()).toEqual(["id", "qty"]);
  });

  it("merges sparsely, keeping fields the update did not mention", () => {
    const s = store();
    s.upsert([{ id: "1", qty: 5, note: "keep" }]);
    s.upsert([{ id: "1", qty: 6 }]);

    expect(s.getRow("1")).toEqual({ id: "1", qty: 6, note: "keep" });
  });

  it("reports only the columns a sparse update actually changed", () => {
    const s = store();
    s.upsert([{ id: "1", qty: 5, note: "keep" }]);
    const { seen } = ticks(s);
    s.upsert([{ id: "1", qty: 6 }]);

    expect((seen[0] as { columns: string[] }).columns.sort()).toEqual(["id", "qty"]);
  });

  it("treats an explicit undefined as no news, not as a clear", () => {
    const s = store();
    s.upsert([{ id: "1", qty: 5 }]);
    s.upsert([{ id: "1", qty: undefined }]);

    expect(s.getRow("1")).toMatchObject({ qty: 5 });
  });

  it("keys on the stringified value, so 1 and \"1\" are one row", () => {
    const s = store();
    s.upsert([{ id: 1, qty: 5 }]);
    s.upsert([{ id: "1", qty: 6 }]);

    expect(s.size).toBe(1);
  });
});

describe("remove", () => {
  it("drops the rows and reports them", () => {
    const s = store();
    s.replaceSnapshot([{ id: "1" }, { id: "2" }]);
    const { seen } = ticks(s);
    s.remove(["1"]);

    expect(s.getKeys()).toEqual(["2"]);
    expect(seen[0]).toMatchObject({ type: "rows", keys: ["1"] });
  });

  it("stays quiet when nothing matched", () => {
    const s = store();
    s.replaceSnapshot([{ id: "1" }]);
    const { seen } = ticks(s);
    s.remove(["absent"]);

    expect(seen).toEqual([]);
    expect(s.getRevision()).toBe(1);
  });

  it("reports only the keys that were actually there", () => {
    const s = store();
    s.replaceSnapshot([{ id: "1" }]);
    const { seen } = ticks(s);
    s.remove(["1", "absent"]);

    expect(seen[0]).toMatchObject({ keys: ["1"] });
  });

  it("drops the removed row's quick-filter entry too", () => {
    const s = store();
    s.replaceSnapshot([{ id: "1", sym: "AAPL" }]);
    s.remove(["1"]);

    expect(s.getQuickFilterText("1")).toBe("");
  });
});

describe("quick-filter cache", () => {
  it("caches a lowercase aggregate per row", () => {
    const s = store();
    s.upsert([{ id: "1", sym: "AAPL" }]);

    expect(s.getQuickFilterText("1")).toContain("aapl");
  });

  it("answers empty for a key it has never seen", () => {
    expect(store().getQuickFilterText("nope")).toBe("");
  });

  it("refreshes the aggregate when the row changes", () => {
    const s = store();
    s.upsert([{ id: "1", sym: "AAPL" }]);
    s.upsert([{ id: "1", sym: "MSFT" }]);

    expect(s.getQuickFilterText("1")).toContain("msft");
  });

  it("honours a configured column scope", () => {
    const s = store({ quickFilterColumns: ["sym"] });
    s.upsert([{ id: "1", sym: "AAPL", note: "secret" }]);

    expect(s.getQuickFilterText("1")).toContain("aapl");
    expect(s.getQuickFilterText("1")).not.toContain("secret");
  });
});

describe("reads", () => {
  function seeded() {
    const s = store();
    s.replaceSnapshot([
      { id: "1", region: "EMEA", qty: 10 },
      { id: "2", region: "APAC", qty: 20 },
      { id: "3", region: null, qty: 30 },
    ]);
    return s;
  }

  it("reports size, revision, key column and columns", () => {
    expect(seeded().getStats()).toMatchObject({ rowCount: 3, revision: 1, keyColumn: "id" });
  });

  it("answers undefined for a key it does not hold", () => {
    expect(seeded().getRow("nope")).toBeUndefined();
  });

  it("iterates rows lazily", () => {
    expect([...seeded().iterate()]).toHaveLength(3);
  });

  it("iterates key/row pairs", () => {
    expect([...seeded().iterateEntries()].map(([k]) => k)).toEqual(["1", "2", "3"]);
  });

  it("materialises all rows when asked", () => {
    expect(seeded().getAllRows()).toHaveLength(3);
  });

  it("lists unique values for a known column, sorted", () => {
    // A null reads as the empty string, which is what an AG Grid set filter
    // shows as its "(Blanks)" entry.
    expect(seeded().getUniqueValues("region")).toEqual(["", "APAC", "EMEA"]);
  });

  it("answers nothing for a column no row carries", () => {
    // Scanning would map every row's `undefined` to `''` and show a phantom
    // blank entry.
    expect(seeded().getUniqueValues("absent")).toEqual([]);
  });

  it("narrows unique values through a predicate", () => {
    expect(
      seeded().getUniqueValuesFiltered("region", (r) => (r.qty as number) < 25),
    ).toEqual(["APAC", "EMEA"]);
  });

  it("scans every row when no predicate is given", () => {
    expect(seeded().getUniqueValuesFiltered("qty")).toEqual(["10", "20", "30"]);
  });

  it("reports its size", () => {
    expect(seeded().size).toBe(3);
  });

  it("does not call the predicate at all on an empty store", () => {
    const predicate = vi.fn(() => true);
    expect(store().getUniqueValuesFiltered("region", predicate)).toEqual([]);
    expect(predicate).not.toHaveBeenCalled();
  });
});
