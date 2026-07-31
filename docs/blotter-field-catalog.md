# Trading Blotter Field Catalog — Fixed Income & Equities

A reference catalog of fields/attributes used in trading-system blotters across Fixed Income (Rates, Credit, MBS/CMBS, ABS, Munis) and Equities. Each field lists a suggested **column id**, a display **caption**, a **format/type**, and notes on semantics, conventions, and product applicability.

**Format key**
- `str` text · `int` integer · `dec(n)` decimal with n places · `pct(n)` percent with n places · `bps` basis points · `ccy` currency-formatted · `dt` date · `ts` timestamp · `bool` boolean · `enum` enumerated · `dur(yrs)` years (decimal) · `32nds` Treasury tick price · `MM` millions
- *Product tags:* `[UST]` Treasuries · `[MBS]` agency MBS/TBA · `[CMBS]` · `[ABS]` · `[CORP]` corporates · `[MUNI]` municipals · `[EQ]` equities · `[ALL]` cross-asset

---

## 1. Instrument Identification

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `cusip` | CUSIP | str (9) | Primary identifier US securities `[ALL]` |
| `isin` | ISIN | str (12) | Global identifier `[ALL]` |
| `sedol` | SEDOL | str (7) | UK/intl listing `[EQ][CORP]` |
| `ticker` | Ticker | str | Exchange symbol `[EQ]` |
| `bbgId` | BBG ID | str | Bloomberg unique / FIGI `[ALL]` |
| `ricCode` | RIC | str | Refinitiv instrument code `[ALL]` |
| `figi` | FIGI | str (12) | OpenFIGI identifier `[ALL]` |
| `internalId` | Sec ID | str | Firm security-master key `[ALL]` |
| `desc` | Description | str | Human-readable security name `[ALL]` |
| `shortName` | Name | str | Abbreviated for narrow columns `[ALL]` |
| `assetClass` | Asset Class | enum | Rates/Credit/MBS/CMBS/ABS/Equity/Muni `[ALL]` |
| `productType` | Product | enum | Bond/Note/TBA/Pool/Swap/Future/Option/Equity `[ALL]` |
| `cusipPool` | Pool # | str | MBS pool number `[MBS]` |
| `dealName` | Deal | str | Securitization deal `[CMBS][ABS]` |
| `trancheId` | Tranche | str | Tranche/class within deal `[CMBS][ABS]` |
| `seriesClass` | Series/Class | str | e.g. "2021-C1 A-2" `[CMBS]` |

---

## 2. Security Master / Reference Data

### 2.1 Common reference

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `issuer` | Issuer | str | Legal issuing entity `[ALL]` |
| `issuerTicker` | Issuer Ticker | str | e.g. "AAPL", "T" `[CORP][EQ]` |
| `parent` | Parent | str | Ultimate parent / guarantor `[CORP]` |
| `country` | Country | enum | ISO country of risk `[ALL]` |
| `currency` | Ccy | enum | ISO 4217 denomination `[ALL]` |
| `sector` | Sector | enum | GICS/internal sector `[CORP][EQ]` |
| `industry` | Industry | enum | Sub-sector / industry group `[CORP][EQ]` |
| `seniority` | Seniority | enum | Sr Secured/Sr Unsec/Sub/Jr Sub `[CORP]` |
| `couponType` | Cpn Type | enum | Fixed/Float/Step/Zero/PIK `[CORP][MUNI][MBS]` |
| `coupon` | Coupon | pct(3) | Stated coupon rate `[ALL FI]` |
| `couponFreq` | Freq | enum | Annual/Semi/Qtr/Monthly `[FI]` |
| `dayCount` | Day Count | enum | 30/360, ACT/ACT, ACT/360 `[FI]` |
| `issueDate` | Issue Dt | dt | Original issuance date `[FI]` |
| `datedDate` | Dated Dt | dt | Interest accrual start `[FI][MUNI]` |
| `maturity` | Maturity | dt | Final maturity `[FI]` |
| `firstCpnDate` | 1st Cpn | dt | First coupon date `[FI]` |
| `nextCpnDate` | Next Cpn | dt | Next scheduled coupon `[FI]` |
| `issueSize` | Issue Size | ccy MM | Original issued amount `[FI]` |
| `amtOutstanding` | Amt Out | ccy MM | Current outstanding `[FI]` |
| `minPiece` | Min Piece | ccy | Minimum denomination `[CORP][MUNI]` |
| `increment` | Increment | ccy | Trading increment `[FI]` |
| `callable` | Callable | bool | Has call schedule `[CORP][MUNI]` |
| `putable` | Putable | bool | Has put schedule `[CORP]` |
| `nextCallDate` | Next Call | dt | Next call date `[CORP][MUNI]` |
| `nextCallPrice` | Call Px | dec(3) | Next call price `[CORP][MUNI]` |
| `workoutDate` | Workout Dt | dt | Effective redemption used in analytics `[CORP][MUNI]` |
| `is144a` | 144A | bool | Rule 144A private placement `[CORP]` |
| `regS` | Reg S | bool | Reg S offering `[CORP]` |

### 2.2 Ratings

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `ratingSp` | S&P | enum | AAA…D `[FI]` |
| `ratingMoody` | Moody's | enum | Aaa…C `[FI]` |
| `ratingFitch` | Fitch | enum | AAA…D `[FI]` |
| `ratingComposite` | Composite | enum | Firm composite/middle rating `[FI]` |
| `ratingNumeric` | Rating # | int | Numeric rank for sorting `[FI]` |
| `igHy` | IG/HY | enum | Investment Grade / High Yield `[CORP]` |
| `ratingOutlook` | Outlook | enum | Pos/Neg/Stable/Watch `[FI]` |
| `ratingDate` | Rating Dt | dt | Last rating action `[FI]` |

### 2.3 UST / Rates specifics

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `tenor` | Tenor | str | 2Y/3Y/5Y/7Y/10Y/20Y/30Y `[UST]` |
| `benchmarkFlag` | OTR | enum | On-the-run / Off-the-run `[UST]` |
| `otrOfr` | OTR/OFR | enum | OTR, OFR1, OFR2… `[UST]` |
| `auctionDate` | Auction Dt | dt | Treasury auction date `[UST]` |
| `tips` | TIPS | bool | Inflation-protected `[UST]` |
| `indexRatio` | Index Ratio | dec(5) | TIPS inflation index ratio `[UST]` |
| `stripFlag` | Strip | bool | STRIPS principal/coupon `[UST]` |

### 2.4 MBS / TBA specifics

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `agency` | Agency | enum | FNMA/FHLMC/GNMA `[MBS]` |
| `program` | Program | enum | 30Y/15Y/ARM/GNMA I/II `[MBS]` |
| `wac` | WAC | pct(3) | Weighted Avg Coupon `[MBS]` |
| `wam` | WAM | int (mo) | Weighted Avg Maturity (months) `[MBS]` |
| `wala` | WALA | int (mo) | Weighted Avg Loan Age `[MBS]` |
| `factor` | Factor | dec(8) | Current pool factor (0–1) `[MBS]` |
| `origFace` | Orig Face | ccy MM | Original face `[MBS]` |
| `currentFace` | Cur Face | ccy MM | Current face = orig × factor `[MBS]` |
| `settleMonth` | Settle Mo | str | TBA settlement month `[MBS]` |
| `tbaCoupon` | TBA Cpn | pct(3) | TBA coupon stack `[MBS]` |
| `weightedLoanRate` | WLR | pct(3) | Weighted loan rate `[MBS]` |
| `geographicConc` | Geo Conc | str | Top state concentration `[MBS]` |
| `loanBalance` | Loan Bal | enum | LLB/MLB/HLB spec story `[MBS]` |
| `specStory` | Spec Story | str | Specified-pool characteristic `[MBS]` |
| `seasoning` | Seasoning | int (mo) | Months since origination `[MBS]` |
| `cpr` | CPR | pct(2) | Conditional Prepayment Rate `[MBS]` |
| `psa` | PSA | pct(0) | PSA prepayment speed `[MBS]` |
| `smm` | SMM | pct(4) | Single Monthly Mortality `[MBS]` |
| `prepayModel` | Model | str | Prepay model used `[MBS]` |

### 2.5 CMBS / ABS specifics

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `trancheType` | Class | enum | A/B/C/IO/Mezz/Equity `[CMBS][ABS]` |
| `subordination` | Subord | pct(2) | Credit support below tranche `[CMBS]` |
| `attachPoint` | Attach | pct(2) | Attachment point `[CMBS][ABS]` |
| `detachPoint` | Detach | pct(2) | Detachment point `[CMBS][ABS]` |
| `wal` | WAL | dur(yrs) | Weighted Avg Life `[CMBS][ABS]` |
| `dscr` | DSCR | dec(2) | Debt Service Coverage Ratio `[CMBS]` |
| `ltv` | LTV | pct(1) | Loan-to-Value `[CMBS]` |
| `originalLtv` | Orig LTV | pct(1) | LTV at origination `[CMBS]` |
| `delinq30` | 30D Delinq | pct(2) | 30-day delinquency `[CMBS][ABS]` |
| `delinq60` | 60D Delinq | pct(2) | 60-day delinquency `[CMBS][ABS]` |
| `delinq90` | 90D+ Delinq | pct(2) | 90+ delinquency `[CMBS][ABS]` |
| `specServicer` | Spec Serv | str | Special servicer `[CMBS]` |
| `watchlist` | Watchlist | pct(2) | % loans on watchlist `[CMBS]` |
| `propertyType` | Prop Type | enum | Office/Retail/Multifamily/Industrial `[CMBS]` |
| `vintage` | Vintage | int | Origination year `[CMBS][ABS]` |
| `creditEnh` | Cr Enh | pct(2) | Credit enhancement `[ABS]` |
| `pac` | PAC/TAC | enum | PAC/TAC/Companion `[MBS][CMBS]` |
| `cdr` | CDR | pct(2) | Conditional Default Rate `[CMBS][ABS]` |
| `severity` | Loss Sev | pct(1) | Loss severity `[CMBS][ABS]` |

### 2.6 Equity specifics

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `exchange` | Exch | enum | NYSE/NASDAQ/ARCA/etc `[EQ]` |
| `primaryExch` | Prim Exch | enum | Primary listing `[EQ]` |
| `secType` | Type | enum | Common/Pref/ADR/ETF/REIT `[EQ]` |
| `lotSize` | Lot | int | Round-lot size `[EQ]` |
| `sharesOut` | Shares Out | int | Shares outstanding `[EQ]` |
| `floatShares` | Float | int | Free float `[EQ]` |
| `marketCap` | Mkt Cap | ccy MM | Market capitalization `[EQ]` |
| `gicsSector` | GICS | enum | GICS classification `[EQ]` |
| `dividendYield` | Div Yld | pct(2) | Trailing dividend yield `[EQ]` |
| `exDivDate` | Ex-Div | dt | Ex-dividend date `[EQ]` |
| `shortable` | SS Avail | bool | Borrow available `[EQ]` |
| `borrowRate` | Borrow | pct(2) | Stock borrow rate `[EQ]` |
| `hardToBorrow` | HTB | bool | Hard-to-borrow flag `[EQ]` |
| `adv` | ADV | int | Average daily volume `[EQ]` |

---

## 3. Order Fields

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `orderId` | Order ID | str | Internal order key `[ALL]` |
| `parentOrderId` | Parent ID | str | Parent for child slices `[ALL]` |
| `clOrdId` | ClOrdID | str | FIX client order id (11) `[ALL]` |
| `origClOrdId` | OrigClOrdID | str | FIX 41 on amend/cancel `[ALL]` |
| `orderType` | Ord Type | enum | Market/Limit/Stop/StopLimit/Peg `[ALL]` |
| `side` | Side | enum | Buy/Sell/SellShort/BuyCover `[ALL]` |
| `tif` | TIF | enum | DAY/GTC/IOC/FOK/GTD/OPG/CLO `[ALL]` |
| `orderQty` | Order Qty | int / ccy MM | Shares `[EQ]` / face `[FI]` |
| `limitPrice` | Limit | dec / 32nds | Limit price `[ALL]` |
| `stopPrice` | Stop | dec | Stop trigger `[EQ]` |
| `displayQty` | Display | int | Visible (iceberg) qty `[EQ]` |
| `minQty` | Min Qty | int | Minimum fill `[EQ]` |
| `leavesQty` | Leaves | int / ccy MM | Open remaining `[ALL]` |
| `cumQty` | Cum Qty | int / ccy MM | Filled so far `[ALL]` |
| `avgPx` | Avg Px | dec(4) | Average fill price `[ALL]` |
| `ordStatus` | Status | enum | New/PartFill/Filled/Canceled/Rejected `[ALL]` |
| `execInst` | Exec Inst | str | FIX 18 execution instructions `[ALL]` |
| `handlInst` | Handl Inst | enum | Auto/Manual/DMA `[ALL]` |
| `algoStrategy` | Algo | enum | VWAP/TWAP/POV/IS/Iceberg `[EQ]` |
| `participationRate` | POV % | pct(1) | Target participation `[EQ]` |
| `routeDest` | Route | str | Destination venue/broker `[ALL]` |
| `orderCapacity` | Capacity | enum | Agency/Principal/RisklessPrincipal `[ALL]` |
| `account` | Account | str | Trading account `[ALL]` |
| `trader` | Trader | str | Owning trader `[ALL]` |
| `desk` | Desk | str | Trading desk `[ALL]` |
| `book` | Book | str | Risk book / strategy `[ALL]` |
| `orderTime` | Ord Time | ts | Order entry timestamp `[ALL]` |
| `expireTime` | Expire | ts | GTD expiry `[ALL]` |
| `rejectReason` | Rej Reason | str | Rejection text `[ALL]` |

---

## 4. Trade / Execution / Fill Fields

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `tradeId` | Trade ID | str | Internal trade key `[ALL]` |
| `execId` | Exec ID | str | FIX 17 execution id `[ALL]` |
| `blockId` | Block ID | str | Parent block for allocations `[ALL]` |
| `tradeDate` | Trade Dt | dt | Execution date `[ALL]` |
| `tradeTime` | Trade Time | ts | Execution timestamp `[ALL]` |
| `side` | Side | enum | Buy/Sell `[ALL]` |
| `qty` | Qty | int / ccy MM | Executed quantity `[ALL]` |
| `price` | Price | dec / 32nds | Execution price `[ALL]` |
| `yield` | Yield | pct(3) | Trade yield `[FI]` |
| `spread` | Spread | bps | Trade spread to benchmark `[FI]` |
| `principal` | Principal | ccy | Qty × price (clean) `[ALL]` |
| `accruedInt` | Accrued | ccy | Accrued interest `[FI]` |
| `netMoney` | Net Money | ccy | Settlement amount `[ALL]` |
| `commission` | Comm | ccy | Commission `[EQ]` |
| `fees` | Fees | ccy | Exchange/reg/SEC fees `[ALL]` |
| `secFee` | SEC Fee | ccy | Section 31 fee `[EQ]` |
| `markup` | Markup | bps | Dealer markup/markdown `[FI]` |
| `counterparty` | CP | str | Counterparty/broker `[ALL]` |
| `cpLei` | CP LEI | str (20) | Counterparty LEI `[ALL]` |
| `venue` | Venue | str | Execution venue/MIC `[ALL]` |
| `mic` | MIC | str (4) | Market Identifier Code `[ALL]` |
| `liquidityInd` | Liq | enum | Add/Remove/Maker/Taker `[EQ]` |
| `capacity` | Capacity | enum | Agency/Principal `[ALL]` |
| `settleDate` | Settle Dt | dt | Settlement date `[ALL]` |
| `settleType` | Settle | enum | T+0/T+1/T+2/Regular/Cash `[ALL]` |
| `tradeStatus` | Status | enum | New/Verified/Allocated/Settled/Canceled/Busted `[ALL]` |
| `allocStatus` | Alloc | enum | Pending/Partial/Complete `[ALL]` |
| `correctedFlag` | Corr | bool | Trade correction `[ALL]` |
| `asOfFlag` | As-Of | bool | As-of/late trade `[ALL]` |
| `tradeSource` | Source | enum | Voice/Electronic/RFQ/API `[ALL]` |
| `repoFlag` | Repo | bool | Repo/financing leg `[FI]` |
| `tradeCcy` | Trade Ccy | enum | Trade currency `[ALL]` |
| `fxRate` | FX Rate | dec(6) | Conversion to base ccy `[ALL]` |

---

## 5. Position Fields

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `position` | Position | int / ccy MM | Net position (signed) `[ALL]` |
| `sodPosition` | SOD Pos | int / ccy MM | Start-of-day position `[ALL]` |
| `currentFacePos` | Cur Face | ccy MM | Current face held `[MBS]` |
| `longQty` | Long | int / ccy MM | Long leg `[ALL]` |
| `shortQty` | Short | int / ccy MM | Short leg `[ALL]` |
| `netQty` | Net | int / ccy MM | Long − Short `[ALL]` |
| `avgCost` | Avg Cost | dec(4) | Average cost basis `[ALL]` |
| `costBasis` | Cost Basis | ccy | Total cost `[ALL]` |
| `marketValue` | Mkt Val | ccy | Position × mark `[ALL]` |
| `notional` | Notional | ccy | Notional exposure `[ALL]` |
| `bookValue` | Book Val | ccy | Accounting book value `[ALL]` |
| `mark` | Mark | dec / 32nds | Current mark price `[ALL]` |
| `markSource` | Mark Src | enum | Trader/Eval/Composite/Last `[ALL]` |
| `markTime` | Mark Time | ts | Last mark timestamp `[ALL]` |
| `tradedToday` | Traded Today | int / ccy MM | Today's net activity `[ALL]` |
| `boughtToday` | Bot | int / ccy MM | Today's buys `[ALL]` |
| `soldToday` | Sld | int / ccy MM | Today's sells `[ALL]` |
| `wac_pos` | Pos WAC | pct(3) | Weighted coupon of position `[MBS]` |

---

## 6. Pricing / Valuation Fields

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `bidPrice` | Bid | dec / 32nds | Best bid `[ALL]` |
| `askPrice` | Ask | dec / 32nds | Best offer `[ALL]` |
| `midPrice` | Mid | dec / 32nds | Bid/ask midpoint `[ALL]` |
| `lastPrice` | Last | dec / 32nds | Last trade `[ALL]` |
| `bidYield` | Bid Yld | pct(3) | Yield at bid `[FI]` |
| `askYield` | Ask Yld | pct(3) | Yield at ask `[FI]` |
| `bidSize` | Bid Sz | int / ccy MM | Size at bid `[ALL]` |
| `askSize` | Ask Sz | int / ccy MM | Size at ask `[ALL]` |
| `bidSpread` | Bid Spd | bps | Spread at bid `[FI]` |
| `askSpread` | Ask Spd | bps | Spread at ask `[FI]` |
| `cleanPrice` | Clean Px | dec(4) | Price ex-accrued `[FI]` |
| `dirtyPrice` | Dirty Px | dec(4) | Price incl accrued `[FI]` |
| `theoPrice` | Theo | dec(4) | Theoretical/model price `[ALL]` |
| `evalPrice` | Eval | dec(4) | 3rd-party evaluated price `[FI]` |
| `priorClose` | Prior Cls | dec / 32nds | Previous settle/close `[ALL]` |
| `netChange` | Chg | dec / 32nds | Change vs prior close `[ALL]` |
| `pctChange` | % Chg | pct(2) | Percent change `[ALL]` |
| `openPrice` | Open | dec | Session open `[EQ]` |
| `highPrice` | High | dec | Session high `[EQ]` |
| `lowPrice` | Low | dec | Session low `[EQ]` |
| `vwap` | VWAP | dec(4) | Volume-weighted avg `[EQ]` |
| `priceTime` | Px Time | ts | Last price update `[ALL]` |

### 6.1 FI yield / spread family

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `ytm` | YTM | pct(3) | Yield to maturity `[FI]` |
| `ytw` | YTW | pct(3) | Yield to worst `[CORP][MUNI]` |
| `ytc` | YTC | pct(3) | Yield to call `[CORP][MUNI]` |
| `currentYield` | Cur Yld | pct(3) | Coupon / price `[FI]` |
| `bondEquivYield` | BEY | pct(3) | Bond-equivalent yield `[FI]` |
| `discountMargin` | DM | bps | Discount margin `[FRN][ABS]` |
| `gSpread` | G-Sprd | bps | Spread to govt curve `[CORP]` |
| `iSpread` | I-Sprd | bps | Spread to swap (interp) `[CORP]` |
| `zSpread` | Z-Sprd | bps | Zero-volatility spread `[FI]` |
| `oas` | OAS | bps | Option-adjusted spread `[MBS][CMBS][CORP]` |
| `asw` | ASW | bps | Asset-swap spread `[CORP]` |
| `benchSpread` | Bench Spd | bps | Spread to named benchmark `[FI]` |
| `benchmark` | Bench | str | Benchmark security `[FI]` |
| `nominalSpread` | Nom Spd | bps | Spread to interpolated curve `[MBS]` |
| `swapSpread` | Swap Spd | bps | Treasury–swap spread `[UST]` |
| `tedSpread` | TED | bps | TED spread `[Rates]` |
| `assetSwapLevel` | ASW Lvl | bps | Par/par asset swap `[CORP]` |

---

## 7. Risk / Analytics Fields

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `dv01` | DV01 | ccy | Dollar value of 1bp `[FI]` |
| `pv01` | PV01 | ccy | Present value of 1bp `[FI]` |
| `cs01` | CS01 | ccy | Credit spread 1bp `[CORP]` |
| `ir01` | IR01 | ccy | Interest-rate 1bp `[FI]` |
| `modDuration` | Mod Dur | dur(yrs) | Modified duration `[FI]` |
| `macDuration` | Mac Dur | dur(yrs) | Macaulay duration `[FI]` |
| `effDuration` | Eff Dur | dur(yrs) | Effective (OA) duration `[MBS][CMBS][CORP]` |
| `spreadDuration` | Spd Dur | dur(yrs) | Spread duration `[CORP]` |
| `convexity` | Convexity | dec(2) | Price convexity `[FI]` |
| `effConvexity` | Eff Cvx | dec(2) | Effective convexity `[MBS]` |
| `krd2y`…`krd30y` | KRD 2Y… | dur(yrs) | Key-rate durations by node `[FI]` |
| `accruedDays` | Acc Days | int | Days of accrued interest `[FI]` |
| `accruedFactor` | Acc Factor | dec(6) | Accrual fraction `[FI]` |
| `wal_risk` | WAL | dur(yrs) | Weighted avg life `[MBS][CMBS]` |
| `oad` | OAD | dur(yrs) | Option-adjusted duration `[MBS]` |
| `oac` | OAC | dec(2) | Option-adjusted convexity `[MBS]` |
| `spreadDv01` | Spd DV01 | ccy | Per-bp spread sensitivity `[CORP]` |
| `jtd` | JTD | ccy | Jump-to-default `[CORP]` |
| `delta` | Delta | dec(4) | Option delta `[Options][EQ]` |
| `gamma` | Gamma | dec(4) | Option gamma `[Options]` |
| `vega` | Vega | ccy | Vol sensitivity `[Options]` |
| `theta` | Theta | ccy | Time decay `[Options]` |
| `rho` | Rho | ccy | Rate sensitivity `[Options]` |
| `beta` | Beta | dec(2) | Equity beta `[EQ]` |
| `var95` | VaR 95 | ccy | Value-at-risk `[ALL]` |
| `stressPnl` | Stress | ccy | Stress-scenario P&L `[ALL]` |
| `netDv01` | Net DV01 | ccy | Book-level net DV01 `[FI]` |
| `hedgeRatio` | Hedge | dec(3) | Hedge ratio vs benchmark `[FI]` |

---

## 8. P&L Fields

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `realizedPnl` | Real P&L | ccy | Realized today `[ALL]` |
| `unrealizedPnl` | Unreal P&L | ccy | Mark-to-market `[ALL]` |
| `dayPnl` | Day P&L | ccy | Total today `[ALL]` |
| `mtdPnl` | MTD P&L | ccy | Month-to-date `[ALL]` |
| `ytdPnl` | YTD P&L | ccy | Year-to-date `[ALL]` |
| `inceptionPnl` | ITD P&L | ccy | Since inception `[ALL]` |
| `carryPnl` | Carry | ccy | Coupon/carry component `[FI]` |
| `priceePnl` | Price P&L | ccy | Price-move component `[ALL]` |
| `spreadPnl` | Spread P&L | ccy | Spread-move component `[FI]` |
| `ratePnl` | Rate P&L | ccy | Rate-move component `[FI]` |
| `fxPnl` | FX P&L | ccy | Currency component `[ALL]` |
| `financingPnl` | Fin P&L | ccy | Repo/financing `[FI]` |
| `commissionPnl` | Comm P&L | ccy | Commission impact `[EQ]` |
| `theoEdge` | Edge | ccy/bps | Theo vs trade price `[ALL]` |

---

## 9. RFQ / Quote Fields

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `rfqId` | RFQ ID | str | Request id `[FI]` |
| `rfqStatus` | RFQ Status | enum | Open/Quoted/Done/Passed/Expired `[FI]` |
| `rfqSide` | Side | enum | Bid/Offer/2-Way `[FI]` |
| `rfqSize` | Size | ccy MM | Requested size `[FI]` |
| `quoteCount` | # Quotes | int | Dealers responding `[FI]` |
| `bestBid` | Best Bid | dec / bps | Best received bid `[FI]` |
| `bestOffer` | Best Ofr | dec / bps | Best received offer `[FI]` |
| `coverPrice` | Cover | dec / bps | 2nd-best (cover) level `[FI]` |
| `winner` | Winner | str | Winning dealer `[FI]` |
| `platform` | Platform | enum | TW/BBG/MarketAxess/Tradeweb `[FI]` |
| `quoteTime` | Quote Time | ts | Quote timestamp `[FI]` |
| `responseTime` | Resp (ms) | int | Latency to quote `[FI]` |
| `axeFlag` | Axe | enum | Buy/Sell axe interest `[FI]` |
| `axeSize` | Axe Sz | ccy MM | Axe size `[FI]` |
| `axeLevel` | Axe Lvl | dec / bps | Axe price/spread `[FI]` |

---

## 10. Counterparty / Settlement / Clearing

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `cpName` | Counterparty | str | CP legal name `[ALL]` |
| `cpShortName` | CP | str | Short code `[ALL]` |
| `cpLei` | LEI | str (20) | Legal Entity Identifier `[ALL]` |
| `clearingBroker` | Clearing | str | Clearing firm `[ALL]` |
| `clearingHouse` | CCP | enum | DTCC/FICC/OCC/LCH `[ALL]` |
| `custodian` | Custodian | str | Custody account `[ALL]` |
| `ssi` | SSI | str | Standard settlement instructions `[ALL]` |
| `settleLocation` | Settle Loc | enum | DTC/Fed/Euroclear/Clearstream `[FI]` |
| `settleStatus` | Settle Status | enum | Pending/Matched/Settled/Failed `[ALL]` |
| `failFlag` | Fail | bool | Settlement fail `[ALL]` |
| `failDays` | Fail Days | int | Days failing `[ALL]` |
| `netSettleAmt` | Net Settle | ccy | Settlement money `[ALL]` |
| `confirmStatus` | Confirm | enum | Pending/Affirmed/Confirmed `[ALL]` |
| `givenUpTo` | Give-Up | str | Give-up broker `[ALL]` |

---

## 11. Compliance / Regulatory

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `restrictedFlag` | Restricted | bool | On restricted list `[ALL]` |
| `watchListFlag` | Watch | bool | Compliance watch `[ALL]` |
| `wallCrossed` | Wall | bool | Information-barrier flag `[ALL]` |
| `shortSaleType` | SS Type | enum | Short/ShortExempt `[EQ]` |
| `locateId` | Locate | str | Short-sale locate id `[EQ]` |
| `reg sho` | Reg SHO | enum | Threshold/Restricted `[EQ]` |
| `tradeReportFlag` | TRACE/RTRS | enum | TRACE/RTRS reporting status `[FI][MUNI]` |
| `traceTimestamp` | TRACE Ts | ts | TRACE reported time `[CORP]` |
| `mifidFlag` | MiFID | bool | MiFID II in scope `[ALL]` |
| `bestExFlag` | Best Ex | enum | Best-execution check `[ALL]` |
| `largeTraderId` | LTID | str | SEC large-trader id `[EQ]` |
| `volckerFlag` | Volcker | enum | Market-making/Prop classification `[ALL]` |
| `crossTradeFlag` | Cross | bool | Internal cross `[ALL]` |
| `prePostTradeChk` | Risk Chk | enum | Passed/Breached/Override `[ALL]` |

---

## 12. Audit / System / Metadata

| Column id | Caption | Format | Notes |
|---|---|---|---|
| `enteredBy` | Entered By | str | User who booked `[ALL]` |
| `enteredTime` | Entered | ts | Booking timestamp `[ALL]` |
| `lastModBy` | Mod By | str | Last modifier `[ALL]` |
| `lastModTime` | Modified | ts | Last modification `[ALL]` |
| `version` | Ver | int | Record version `[ALL]` |
| `sourceSystem` | Source Sys | str | Originating system `[ALL]` |
| `messageSeq` | Seq | int | Wire/feed sequence `[ALL]` |
| `correlationId` | Corr ID | str | Cross-system trace id `[ALL]` |
| `parentTradeId` | Parent | str | Linkage to parent `[ALL]` |
| `tags` | Tags | str[] | Free-form tags `[ALL]` |
| `comment` | Comment | str | Trader/ops note `[ALL]` |
| `staleFlag` | Stale | bool | Data older than threshold `[ALL]` |
| `lastTickTime` | Tick Time | ts | Last market update `[ALL]` |
| `rowState` | Row State | enum | Clean/Edited/Pending/Error (UI) `[ALL]` |

---

## 13. Display / Derived UI Conventions

These are not stored fields but common derived/display columns and formatting rules worth standardizing in a config-driven blotter.

| Concept | Caption | Convention |
|---|---|---|
| Price (Treasuries) | Price | `32nds` — `101-16+` where `+` = ½ of a 32nd (i.e. 1/64). Some desks render `101-165` |
| Price (TBA/Agency) | Price | `32nds`, often to 32nds or 64ths |
| Price (Credit/Corp) | Price | `dec(3)`–`dec(4)` decimal points of par |
| Price (Equity) | Last | `ccy` 2 dp; sub-penny where applicable |
| Spread | Spread | signed `bps`, e.g. `+125`, `-12` |
| Size (FI) | Size | `MM` notional, e.g. `5MM`, `0.5MM` |
| Size (Equity) | Qty | integer shares; `k`/`M` abbreviation in tight columns |
| Signed change | Chg | color: green up / red down; arrow glyph optional |
| Tick direction | — | uptick/downtick cell flash on `lastPrice` change |
| Side | Side | Buy = blue/green, Sell = red (per house style) |
| Status | Status | chip/pill rendering by `ordStatus` enum |
| Yield/% values | — | right-aligned, fixed decimals, monospace numerals |
| Stale data | — | dimmed/italic when `staleFlag` true |

---

## 14. Notes on modeling

- **Quantity semantics differ by asset class.** Equities use shares (integers); FI uses notional/face (often in MM). MBS additionally tracks original vs current face via `factor`. A unified `quantity` plus `quantityUnit` enum (`shares` / `face` / `currentFace` / `contracts`) keeps a single grid coherent.
- **Price/yield/spread are interchangeable quoting bases in FI.** A blotter cell often needs a `quoteBasis` (`price` / `yield` / `spread` / `dm`) plus linkage logic so editing one recomputes the others. This is the classic price↔spread↔yield linkage in credit/MBS tickets.
- **Discriminated unions per product** map cleanly to this catalog: a shared base (identification, position, pricing, risk, P&L, audit) plus product-specific extensions (UST/MBS/CMBS/ABS/Corp/Muni/Equity).
- **Most performant conditional styling** at 600+ columns is string-expression rules (e.g. AG-Grid `cellClassRules`) keyed off enum/numeric fields rather than per-cell callbacks.

---

*This catalog is intentionally broad; not every desk uses every field. Treat the column ids as suggestions to align with your security-master and ViewServer/CQServer schemas.*
