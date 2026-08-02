import type { DockManagerState } from '@widgetstools/dock-manager-core';
import { p, tg, sp, base } from './helpers';
import type { WidgetId } from './registry';

const P = (id: WidgetId, title: string) => p(id, title, id);

export const TAB_LAYOUTS: Record<string, () => DockManagerState> = {
  market: () => base(
    sp('mkt', 'horizontal', [28, 72], [
      tg('g-book', ['orderBook']),
      sp('mkt-right', 'vertical', [50, 50], [
        tg('g-blotter', ['blotter']),
        sp('mkt-bot', 'horizontal', [58, 42], [tg('g-prints', ['recentPrints']), tg('g-chart', ['priceChart'])]),
      ]),
    ]),
    { blotter: P('blotter', 'Bond Blotter'), priceChart: P('priceChart', 'Price'), orderBook: P('orderBook', 'Order Book'), recentPrints: P('recentPrints', 'Recent Prints') },
    'blotter',
  ),
  orders: () => base(
    sp('ord', 'vertical', [18, 82], [
      tg('g-okpi', ['ordersKpi']),
      sp('ord-bot', 'horizontal', [72, 28], [tg('g-ord', ['ordersBlotter']), tg('g-odetail', ['orderDetail', 'orderEntry'])]),
    ]),
    {
      ordersKpi: P('ordersKpi', 'Orders Summary'),
      ordersBlotter: P('ordersBlotter', 'Order Blotter'),
      orderDetail: P('orderDetail', 'Order Detail'),
      orderEntry: P('orderEntry', 'Order Entry'),
    },
    'ordersBlotter',
  ),
  analytics: () => base(
    sp('an', 'vertical', [50, 50], [
      sp('an-top', 'horizontal', [34, 33, 33], [tg('g-oasdur', ['oasDuration']), tg('g-durb', ['durationBuckets']), tg('g-sect', ['sectorDonut'])]),
      sp('an-bot', 'horizontal', [34, 33, 33], [tg('g-hist', ['historicalOas']), tg('g-oasd', ['oasDistribution']), tg('g-pnl', ['pnlAttribution'])]),
    ]),
    { oasDuration: P('oasDuration', 'OAS vs Duration'), durationBuckets: P('durationBuckets', 'Duration Buckets'), sectorDonut: P('sectorDonut', 'Sector Allocation'), historicalOas: P('historicalOas', 'CDX IG/HY'), oasDistribution: P('oasDistribution', 'OAS Distribution'), pnlAttribution: P('pnlAttribution', 'P&L Attribution') },
    'oasDuration',
  ),
  risk: () => base(
    sp('rsk', 'vertical', [25, 75], [
      tg('g-kpi', ['riskKpi']),
      sp('rsk-bot', 'horizontal', [26, 48, 26], [
        tg('g-bookrisk', ['bookRisk']),
        sp('rsk-mid', 'vertical', [55, 45], [sp('rsk-mid-top', 'horizontal', [50, 50], [tg('g-dv01', ['dv01ByBook']), tg('g-scen', ['rateScenarios'])]), tg('g-var', ['varTrend'])]),
        tg('g-limits', ['riskLimits']),
      ]),
    ]),
    { riskKpi: P('riskKpi', 'Risk KPIs'), bookRisk: P('bookRisk', 'Book Risk'), dv01ByBook: P('dv01ByBook', 'DV01 by Book'), rateScenarios: P('rateScenarios', 'Rate Scenarios'), varTrend: P('varTrend', 'VaR Trend'), riskLimits: P('riskLimits', 'Risk Limits') },
    'riskKpi',
  ),
  research: () => base(
    sp('res', 'horizontal', [32, 68], [tg('g-list', ['researchList']), tg('g-note', ['noteDetail'])]),
    { researchList: P('researchList', 'Research Notes'), noteDetail: P('noteDetail', 'Note Detail') },
    'researchList',
  ),
  'design-system': () => base(tg('g-ds', ['designSystem']), { designSystem: P('designSystem', 'Design System') }, 'designSystem'),
};
