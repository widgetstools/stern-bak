# Demo layouts

Three import-ready layout files for the Bond Blotter, each highlighting
a different fixed-income workflow. Drop one into the **Layout selector**
(the chevron next to the active layout name) → **Import layout** to load it.

All three target `gridId: "bond-blotter-v1"` and reference only fields that
exist on the demo's mock bond data (`src/mockBonds.ts`).

## 1. Trader Console — `trader-console.json`

Bid / mid / offer trading view. Pinned columns: **Tkr · Description · Side**.

| Feature | What you'll see |
| --- | --- |
| Value formatters | Prices to 3 decimals, yields to 3-decimal %, change in signed bps, P&L in `+$1,234 / -$1,234` |
| Calculated columns | `Bid-Ask (bps)` — `(offer − bid) ÷ mid × 10 000` · `Yld Spread` — `bidYld − offYld` |
| Conditional styling | BID/OFFER/TWO-WAY side badges (green/red/blue) · HY rating tint · wide bid-ask warning · positive/negative P&L coloring |
| Flash | `changeBps` and `midPrice` cells flash on update |

## 2. Risk & P&L — `risk-and-pnl.json`

Risk-manager view with DV01, duration, convexity, and full P&L attribution.
Pinned columns: **Tkr · Description · Rating**.

| Feature | What you'll see |
| --- | --- |
| Value formatters | DV01 to 4 decimals · duration as `0.00 yr` · notional and P&L as `$1,234` with green/red signed format |
| Calculated columns | `DV01 / 1M` — DV01 weighted by notional · `P&L (bps of notional)` · `OAS pickup` vs a 50 bps generic IG baseline |
| Conditional styling | AAA row tint (blue) · HY row tint (amber) · long-duration alert (>15y) · DV01-high warning (>0.12) · strong-day / large-loss P&L flags (±$25k) |

## 3. Relative Value & Spreads — `relative-value.json`

Yield-curve and spread-dispersion view for relative-value trades.
Pinned columns: **Tkr · Description · Rating**.

| Feature | What you'll see |
| --- | --- |
| Value formatters | Coupon and yields to 3-decimal % · OAS / Z-spread in 0.1 bps · duration as `0.x yr` |
| Calculated columns | `YTM − Cpn` (premium/discount) · `Yld ÷ Yr Dur` (yield per unit duration) · `Z − OAS` basis · `Yld vs Sector Avg` (uses `AVG([ytm])`) |
| Conditional styling | OAS cheap (>150 bps, green) / rich (<30 bps, blue) · YTM > 7% amber, < 3% blue · Treasury/Sovereign row tint · liquidity A1/A2 green vs C red · premium vs discount bond coloring |

## Color discipline

All three layouts stick to fixed-income conventions:

- **Green** = positive performance, cheap valuation, good liquidity
- **Red** = losses, long-duration risk, illiquidity
- **Blue / cyan** = informational (Treasury, AAA, tight spread)
- **Amber / yellow** = warnings (HY rating, wide spread, high duration)

Tint backgrounds use 10–22% alpha so the grid stays readable; saturated
fills are reserved for category badges (BID/OFFER/TWO-WAY only).
