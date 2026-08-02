import { describe, expect, it, vi } from 'vitest';
import { buildBondInventory, type Bond } from './mockBonds';

describe('buildBondInventory', () => {
  it('returns the requested count', () => {
    expect(buildBondInventory(10)).toHaveLength(10);
    expect(buildBondInventory(180)).toHaveLength(180);
  });

  it('is deterministic for the same seed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-06-15T12:00:00Z'));
    const a = buildBondInventory(50, 42);
    const b = buildBondInventory(50, 42);
    expect(a).toEqual(b);
    vi.useRealTimers();
  });

  it('produces different data for different seeds', () => {
    const a = buildBondInventory(20, 1);
    const b = buildBondInventory(20, 2);
    expect(a[0].id).not.toBe(b[0].id);
  });

  it('sorts by ticker then maturity', () => {
    const rows = buildBondInventory(100, 99);
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      const cmp =
        prev.ticker.localeCompare(curr.ticker) ||
        prev.maturity.localeCompare(curr.maturity);
      expect(cmp).toBeLessThanOrEqual(0);
    }
  });

  it('assigns unique ids', () => {
    const rows = buildBondInventory(180);
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.size).toBe(180);
  });

  it('populates required bond fields with plausible values', () => {
    const [bond] = buildBondInventory(1, 7);
    expect(bond.id).toMatch(/^[A-Z]+-[A-Z0-9]{6}-0$/);
    expect(bond.cusip).toHaveLength(9);
    expect(bond.isin).toMatch(/^US[A-Z0-9]{9}$|^GB[A-Z0-9]{9}$|^DE[A-Z0-9]{9}$/);
    expect(bond.ticker.length).toBeGreaterThan(0);
    expect(bond.description).toContain('%');
    expect(bond.bidPrice).toBeLessThanOrEqual(bond.midPrice);
    expect(bond.offerPrice).toBeGreaterThanOrEqual(bond.midPrice);
    expect(['BID', 'OFFER', 'TWO-WAY']).toContain(bond.side);
    expect(['A1', 'A2', 'B1', 'B2', 'C']).toContain(bond.liquidity);
    expect(bond.notional).toBe(bond.size);
    expect(new Date(bond.lastTradedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('rates Treasury bonds as AAA', () => {
    const treasury = buildBondInventory(200, 42).filter((r) => r.sector === 'Treasury');
    expect(treasury.length).toBeGreaterThan(0);
    treasury.forEach((r) => expect(r.rating).toBe('AAA'));
  });

  it('assigns GBP/EUR currency for non-USD sovereigns', () => {
    const rows = buildBondInventory(300, 42);
    const gilt = rows.find((r) => r.ticker === 'GILT');
    const bund = rows.find((r) => r.ticker === 'BUND');
    if (gilt) expect(gilt.currency).toBe('GBP');
    if (bund) expect(bund.currency).toBe('EUR');
  });

  it('assigns Rates desk for Treasury and Sovereign for sovereign sector', () => {
    const rows = buildBondInventory(300, 42);
    rows
      .filter((r) => r.sector === 'Treasury')
      .forEach((r) => expect(r.desk).toBe('Rates'));
    rows
      .filter((r) => r.sector === 'Sovereign')
      .forEach((r) => expect(r.desk).toBe('Sovereign'));
  });

  it('uses size buckets in millions', () => {
    const rows = buildBondInventory(200, 42);
    const sizes = new Set(rows.map((r) => r.size));
    sizes.forEach((s) => {
      expect([1_000_000, 2_000_000, 5_000_000, 10_000_000]).toContain(s);
    });
  });

  it('defaults to 180 rows when count omitted', () => {
    expect(buildBondInventory()).toHaveLength(180);
  });

  it('covers all major sectors over a large sample', () => {
    const rows = buildBondInventory(500, 42);
    const sectors = new Set(rows.map((r) => r.sector));
    expect(sectors.size).toBeGreaterThan(5);
  });

  it('maintains internal price/yield consistency', () => {
    const bond: Bond = buildBondInventory(1, 123)[0];
    expect(bond.ytm).toBeGreaterThan(0);
    expect(bond.duration).toBeGreaterThan(0);
    expect(bond.convexity).toBeGreaterThan(0);
    expect(bond.dv01).toBeGreaterThan(0);
    expect(bond.oas).toBeGreaterThanOrEqual(0);
    expect(bond.zSpread).toBeGreaterThanOrEqual(bond.oas);
  });
});
