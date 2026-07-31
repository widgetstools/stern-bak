/**
 * @wellsfargo-starui/icons-svg
 *
 * Single flat icon library for capital markets applications.
 * All 80 icons live in svg/ and use `currentColor` so they inherit
 * CSS color. Size via width/height attributes or CSS.
 *
 * ─── Usage: React ──────────────────────────────────────────────
 *
 *   // Via SVGR (recommended — supports currentColor + sizing)
 *   import { ReactComponent as BondIcon } from '@wellsfargo-starui/icons-svg/svg/bond.svg';
 *   <BondIcon width={20} height={20} className="text-blue-500" />
 *
 *   // Via Vite asset import
 *   import bondUrl from '@wellsfargo-starui/icons-svg/svg/bond.svg';
 *   <img src={bondUrl} width={20} height={20} alt="Bond" />
 *
 * ─── Usage: Angular ────────────────────────────────────────────
 *
 *   // angular-svg-icon
 *   iconReg.loadSvg('assets/icons/bond.svg', 'bond');
 *   <svg-icon name="bond" [svgStyle]="{ 'width.px': 20 }"></svg-icon>
 *
 *   // Angular Material
 *   matIconReg.addSvgIcon('bond',
 *     sanitizer.bypassSecurityTrustResourceUrl('assets/icons/bond.svg'));
 *   <mat-icon svgIcon="bond"></mat-icon>
 *
 * ─── Sizing ──────────────────────────────────────────────────
 *   viewBox="0 0 24 24" — override via width/height attrs or CSS.
 *
 * ─── Color ───────────────────────────────────────────────────
 *   All strokes/fills use `currentColor`. Set CSS `color` on the icon
 *   or its parent: .icon { color: #3b82f6; } or class="text-blue-500"
 */

// ─── Icon paths (relative to this package) ───────────────────────

export const ICON_PATHS = {
  // Trading
  'bond':                      'svg/bond.svg',
  'candlestick':               'svg/candlestick.svg',
  'coupon':                    'svg/coupon.svg',
  'credit-rating':             'svg/credit-rating.svg',
  'duration':                  'svg/duration.svg',
  'execute-trade':             'svg/execute-trade.svg',
  'interest-rate':             'svg/interest-rate.svg',
  'ipo':                       'svg/ipo.svg',
  'live-feed':                 'svg/live-feed.svg',
  'market-depth':              'svg/market-depth.svg',
  'maturity':                  'svg/maturity.svg',
  'order-book':                'svg/order-book.svg',
  'portfolio':                 'svg/portfolio.svg',
  'position':                  'svg/position.svg',
  'price-alert':               'svg/price-alert.svg',
  'spread':                    'svg/spread.svg',
  'stock':                     'svg/stock.svg',
  'ticker':                    'svg/ticker.svg',
  'trade-ticket':              'svg/trade-ticket.svg',
  'watchlist':                 'svg/watchlist.svg',
  'yield-curve':               'svg/yield-curve.svg',

  // Blotters
  'allocation-blotter':        'svg/allocation-blotter.svg',
  'audit-blotter':             'svg/audit-blotter.svg',
  'block-trade-blotter':       'svg/block-trade-blotter.svg',
  'cash-blotter':              'svg/cash-blotter.svg',
  'commodities-blotter':       'svg/commodities-blotter.svg',
  'derivatives-blotter':       'svg/derivatives-blotter.svg',
  'equity-blotter':            'svg/equity-blotter.svg',
  'execution-blotter':         'svg/execution-blotter.svg',
  'fi-blotter':                'svg/fi-blotter.svg',
  'fx-blotter':                'svg/fx-blotter.svg',
  'order-blotter':             'svg/order-blotter.svg',
  'pending-blotter':           'svg/pending-blotter.svg',
  'pnl-blotter':               'svg/pnl-blotter.svg',
  'position-blotter':          'svg/position-blotter.svg',
  'rejected-blotter':          'svg/rejected-blotter.svg',
  'risk-blotter':              'svg/risk-blotter.svg',
  'settlement-blotter':        'svg/settlement-blotter.svg',
  'trade-blotter':             'svg/trade-blotter.svg',

  // Charts
  'area-chart':                'svg/area-chart.svg',
  'bar-chart':                 'svg/bar-chart.svg',
  'blotter':                   'svg/blotter.svg',
  'heatmap':                   'svg/heatmap.svg',
  'line-chart':                'svg/line-chart.svg',
  'waterfall':                 'svg/waterfall.svg',

  // Risk
  'compliance':                'svg/compliance.svg',
  'counterparty':              'svg/counterparty.svg',
  'drawdown':                  'svg/drawdown.svg',
  'exposure-map':              'svg/exposure-map.svg',
  'hedging':                   'svg/hedging.svg',
  'limits':                    'svg/limits.svg',
  'risk':                      'svg/risk.svg',
  'risk-gauge':                'svg/risk-gauge.svg',
  'scenarios':                 'svg/scenarios.svg',
  'stress-test':               'svg/stress-test.svg',
  'volatility':                'svg/volatility.svg',

  // General
  'alert':                     'svg/alert.svg',
  'analytics':                 'svg/analytics.svg',
  'bank':                      'svg/bank.svg',
  'calculator':                'svg/calculator.svg',
  'clock':                     'svg/clock.svg',
  'currency':                  'svg/currency.svg',
  'dashboard':                 'svg/dashboard.svg',
  'globe':                     'svg/globe.svg',
  'market-data':               'svg/market-data.svg',
  'notifications':             'svg/notifications.svg',
  'percentage':                'svg/percentage.svg',
  'pnl':                       'svg/pnl.svg',
  'reports':                   'svg/reports.svg',
  'settings':                  'svg/settings.svg',
  'trending-down':             'svg/trending-down.svg',
  'trending-up':               'svg/trending-up.svg',

  // System
  'code':                      'svg/code.svg',
  'download':                  'svg/download.svg',
  'eye':                       'svg/eye.svg',
  'moon':                      'svg/moon.svg',
  'refresh':                   'svg/refresh.svg',
  'sun':                       'svg/sun.svg',
  'upload':                    'svg/upload.svg',
  'wrench':                    'svg/wrench.svg',

  // ── Curated (added in feat/workspace-setup-redesign) ────────────────
  // Trading actions
  'buy':                       'svg/buy.svg',
  'sell':                      'svg/sell.svg',
  'execute':                   'svg/execute.svg',
  'new-order':                 'svg/new-order.svg',
  'cancel-order':              'svg/cancel-order.svg',
  'fill-report':               'svg/fill-report.svg',
  'options':                   'svg/options.svg',
  'futures':                   'svg/futures.svg',
  'fx':                        'svg/fx.svg',
  'crypto':                    'svg/crypto.svg',
  'equity':                    'svg/equity.svg',
  'commodity':                 'svg/commodity.svg',
  'settlement':                'svg/settlement.svg',
  'trades':                    'svg/trades.svg',
  'algo':                      'svg/algo.svg',

  // Charts (curated)
  'depth-chart':               'svg/depth-chart.svg',
  'indicator':                 'svg/indicator.svg',
  'volume':                    'svg/volume.svg',

  // Risk (curated)
  'exposure':                  'svg/exposure.svg',
  'var':                       'svg/var.svg',
  'loss':                      'svg/loss.svg',
  'profit':                    'svg/profit.svg',
  'take-profit':               'svg/take-profit.svg',
  'stop-loss':                 'svg/stop-loss.svg',
  'liquidity':                 'svg/liquidity.svg',
  'greeks':                    'svg/greeks.svg',
  'positions':                 'svg/positions.svg',

  // General (curated)
  'audit':                     'svg/audit.svg',
  'export':                    'svg/export.svg',
  'filter':                    'svg/filter.svg',
  'search':                    'svg/search.svg',
  'news':                      'svg/news.svg',
  'connectivity':              'svg/connectivity.svg',

} as const;

export type MarketIconName = keyof typeof ICON_PATHS;

// ─── Icon metadata ───────────────────────────────────────────

export interface IconMeta {
  name: string;
  category: IconCategory;
}

export const ICON_META: Record<MarketIconName, IconMeta> = {
  // Trading
  'bond': { name: 'Bond', category: 'trading' },
  'candlestick': { name: 'Candlestick', category: 'trading' },
  'coupon': { name: 'Coupon', category: 'trading' },
  'credit-rating': { name: 'Credit Rating', category: 'trading' },
  'duration': { name: 'Duration', category: 'trading' },
  'execute-trade': { name: 'Execute Trade', category: 'trading' },
  'interest-rate': { name: 'Interest Rate', category: 'trading' },
  'ipo': { name: 'IPO', category: 'trading' },
  'live-feed': { name: 'Live Feed', category: 'trading' },
  'market-depth': { name: 'Market Depth', category: 'trading' },
  'maturity': { name: 'Maturity', category: 'trading' },
  'order-book': { name: 'Order Book', category: 'trading' },
  'portfolio': { name: 'Portfolio', category: 'trading' },
  'position': { name: 'Position', category: 'trading' },
  'price-alert': { name: 'Price Alert', category: 'trading' },
  'spread': { name: 'Spread', category: 'trading' },
  'stock': { name: 'Stock', category: 'trading' },
  'ticker': { name: 'Ticker', category: 'trading' },
  'trade-ticket': { name: 'Trade Ticket', category: 'trading' },
  'watchlist': { name: 'Watchlist', category: 'trading' },
  'yield-curve': { name: 'Yield Curve', category: 'trading' },

  // Blotters
  'allocation-blotter': { name: 'Allocation Blotter', category: 'blotters' },
  'audit-blotter': { name: 'Audit Blotter', category: 'blotters' },
  'block-trade-blotter': { name: 'Block Trade Blotter', category: 'blotters' },
  'cash-blotter': { name: 'Cash Blotter', category: 'blotters' },
  'commodities-blotter': { name: 'Commodities Blotter', category: 'blotters' },
  'derivatives-blotter': { name: 'Derivatives Blotter', category: 'blotters' },
  'equity-blotter': { name: 'Equity Blotter', category: 'blotters' },
  'execution-blotter': { name: 'Execution Blotter', category: 'blotters' },
  'fi-blotter': { name: 'Fixed Income Blotter', category: 'blotters' },
  'fx-blotter': { name: 'FX Blotter', category: 'blotters' },
  'order-blotter': { name: 'Order Blotter', category: 'blotters' },
  'pending-blotter': { name: 'Pending Blotter', category: 'blotters' },
  'pnl-blotter': { name: 'P&L Blotter', category: 'blotters' },
  'position-blotter': { name: 'Position Blotter', category: 'blotters' },
  'rejected-blotter': { name: 'Rejected Blotter', category: 'blotters' },
  'risk-blotter': { name: 'Risk Blotter', category: 'blotters' },
  'settlement-blotter': { name: 'Settlement Blotter', category: 'blotters' },
  'trade-blotter': { name: 'Trade Blotter', category: 'blotters' },

  // Charts
  'area-chart': { name: 'Area Chart', category: 'charts' },
  'bar-chart': { name: 'Bar Chart', category: 'charts' },
  'blotter': { name: 'Blotter', category: 'blotters' },
  'heatmap': { name: 'Heatmap', category: 'charts' },
  'line-chart': { name: 'Line Chart', category: 'charts' },
  'waterfall': { name: 'Waterfall', category: 'charts' },

  // Risk
  'compliance': { name: 'Compliance', category: 'risk' },
  'counterparty': { name: 'Counterparty', category: 'risk' },
  'drawdown': { name: 'Drawdown', category: 'risk' },
  'exposure-map': { name: 'Exposure Map', category: 'risk' },
  'hedging': { name: 'Hedging', category: 'risk' },
  'limits': { name: 'Limits', category: 'risk' },
  'risk': { name: 'Risk', category: 'risk' },
  'risk-gauge': { name: 'Risk Gauge', category: 'risk' },
  'scenarios': { name: 'Scenarios', category: 'risk' },
  'stress-test': { name: 'Stress Test', category: 'risk' },
  'volatility': { name: 'Volatility', category: 'risk' },

  // General
  'alert': { name: 'Alert', category: 'general' },
  'analytics': { name: 'Analytics', category: 'general' },
  'bank': { name: 'Bank', category: 'general' },
  'calculator': { name: 'Calculator', category: 'general' },
  'clock': { name: 'Clock', category: 'general' },
  'currency': { name: 'Currency', category: 'general' },
  'dashboard': { name: 'Dashboard', category: 'general' },
  'globe': { name: 'Globe', category: 'general' },
  'market-data': { name: 'Market Data', category: 'general' },
  'notifications': { name: 'Notifications', category: 'general' },
  'percentage': { name: 'Percentage', category: 'general' },
  'pnl': { name: 'P&L', category: 'general' },
  'reports': { name: 'Reports', category: 'general' },
  'settings': { name: 'Settings', category: 'general' },
  'trending-down': { name: 'Trending Down', category: 'general' },
  'trending-up': { name: 'Trending Up', category: 'general' },

  // System
  'code': { name: 'Code', category: 'system' },
  'download': { name: 'Download', category: 'system' },
  'eye': { name: 'Eye', category: 'system' },
  'moon': { name: 'Moon', category: 'system' },
  'refresh': { name: 'Refresh', category: 'system' },
  'sun': { name: 'Sun', category: 'system' },
  'upload': { name: 'Upload', category: 'system' },
  'wrench': { name: 'Wrench', category: 'system' },

  // ── Curated (fixed-palette stylized icons) ──────────────────────────
  // Trading actions
  'buy': { name: 'Buy', category: 'trading' },
  'sell': { name: 'Sell', category: 'trading' },
  'execute': { name: 'Execute', category: 'trading' },
  'new-order': { name: 'New Order', category: 'trading' },
  'cancel-order': { name: 'Cancel Order', category: 'trading' },
  'fill-report': { name: 'Fill Report', category: 'trading' },
  'options': { name: 'Options', category: 'trading' },
  'futures': { name: 'Futures', category: 'trading' },
  'fx': { name: 'FX', category: 'trading' },
  'crypto': { name: 'Crypto', category: 'trading' },
  'equity': { name: 'Equity', category: 'trading' },
  'commodity': { name: 'Commodity', category: 'trading' },
  'settlement': { name: 'Settlement', category: 'trading' },
  'trades': { name: 'Trades', category: 'trading' },
  'algo': { name: 'Algo', category: 'trading' },

  // Charts (curated)
  'depth-chart': { name: 'Depth Chart', category: 'charts' },
  'indicator': { name: 'Indicator', category: 'charts' },
  'volume': { name: 'Volume', category: 'charts' },

  // Risk (curated)
  'exposure': { name: 'Exposure', category: 'risk' },
  'var': { name: 'VaR', category: 'risk' },
  'loss': { name: 'Loss', category: 'risk' },
  'profit': { name: 'Profit', category: 'risk' },
  'take-profit': { name: 'Take Profit', category: 'risk' },
  'stop-loss': { name: 'Stop Loss', category: 'risk' },
  'liquidity': { name: 'Liquidity', category: 'risk' },
  'greeks': { name: 'Greeks', category: 'risk' },
  'positions': { name: 'Positions', category: 'risk' },

  // General (curated)
  'audit': { name: 'Audit', category: 'general' },
  'export': { name: 'Export', category: 'general' },
  'filter': { name: 'Filter', category: 'general' },
  'search': { name: 'Search', category: 'general' },
  'news': { name: 'News', category: 'general' },
  'connectivity': { name: 'Connectivity', category: 'general' },

};

// ─── Derived helpers ──────────────────────────────────────────

/** All available icon names */
export const ICON_NAMES = Object.keys(ICON_PATHS) as MarketIconName[];

/** All category strings */
export const ICON_CATEGORY_NAMES = ['trading', 'blotters', 'charts', 'risk', 'general', 'system'] as const;
export type IconCategory = typeof ICON_CATEGORY_NAMES[number];

/** Group icon names by category */
export const ICON_CATEGORIES: Record<IconCategory, MarketIconName[]> = {
  'trading': ICON_NAMES.filter(n => ICON_META[n].category === 'trading'),
  'blotters': ICON_NAMES.filter(n => ICON_META[n].category === 'blotters'),
  'charts': ICON_NAMES.filter(n => ICON_META[n].category === 'charts'),
  'risk': ICON_NAMES.filter(n => ICON_META[n].category === 'risk'),
  'general': ICON_NAMES.filter(n => ICON_META[n].category === 'general'),
  'system': ICON_NAMES.filter(n => ICON_META[n].category === 'system'),
};

/** Get icons for a specific category */
export function getIconsByCategory(category: IconCategory): MarketIconName[] {
  return ICON_CATEGORIES[category] ?? [];
}
