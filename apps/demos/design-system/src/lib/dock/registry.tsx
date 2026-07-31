import type { WidgetProps } from '@widgetstools/react-dock-manager';
import type { ComponentType } from 'react';
import OrderBook from '../../panels/OrderBook';
import { RecentPrints } from '../../panels/RecentPrints';
import { BlotterWidget, PriceChartWidget, OrderEntryWidget } from '../../panels/MarketWidgets';
import { OrdersBlotter } from '../../panels/OrdersBlotter';
import { OrdersKpiStrip } from '../../panels/orders/OrdersKpiStrip';
import { OrderDetail } from '../../panels/orders/OrderDetail';
import { DesignSystemTab } from '../../tabs/DesignSystemTab';
import { OasDurationScatter } from '../../panels/analytics/OasDurationScatter';
import { DurationBuckets } from '../../panels/analytics/DurationBuckets';
import { SectorDonut } from '../../panels/analytics/SectorDonut';
import { HistoricalOas } from '../../panels/analytics/HistoricalOas';
import { OasDistribution } from '../../panels/analytics/OasDistribution';
import { PnlAttribution } from '../../panels/analytics/PnlAttribution';
import { RiskKpiStrip } from '../../panels/risk/RiskKpiStrip';
import { BookRisk } from '../../panels/risk/BookRisk';
import { Dv01ByBook } from '../../panels/risk/Dv01ByBook';
import { RateScenarios } from '../../panels/risk/RateScenarios';
import { VarTrend } from '../../panels/risk/VarTrend';
import { RiskLimits } from '../../panels/risk/RiskLimits';
import { ResearchList } from '../../panels/research/ResearchList';
import { NoteDetail } from '../../panels/research/NoteDetail';

function DesignSystemWidget(_props: WidgetProps) { return <DesignSystemTab />; }

export type WidgetId =
  | 'blotter' | 'priceChart' | 'orderBook' | 'recentPrints'
  | 'ordersKpi' | 'ordersBlotter' | 'orderEntry' | 'orderDetail'
  | 'oasDuration' | 'durationBuckets' | 'sectorDonut' | 'historicalOas' | 'oasDistribution' | 'pnlAttribution'
  | 'riskKpi' | 'bookRisk' | 'dv01ByBook' | 'rateScenarios' | 'varTrend' | 'riskLimits'
  | 'researchList' | 'noteDetail'
  | 'designSystem';

export const WIDGETS: Record<WidgetId, ComponentType<WidgetProps>> = {
  blotter: BlotterWidget, priceChart: PriceChartWidget, orderBook: OrderBook, recentPrints: RecentPrints,
  ordersKpi: OrdersKpiStrip, ordersBlotter: OrdersBlotter, orderEntry: OrderEntryWidget, orderDetail: OrderDetail,
  oasDuration: OasDurationScatter, durationBuckets: DurationBuckets, sectorDonut: SectorDonut,
  historicalOas: HistoricalOas, oasDistribution: OasDistribution, pnlAttribution: PnlAttribution,
  riskKpi: RiskKpiStrip, bookRisk: BookRisk, dv01ByBook: Dv01ByBook,
  rateScenarios: RateScenarios, varTrend: VarTrend, riskLimits: RiskLimits,
  researchList: ResearchList, noteDetail: NoteDetail,
  designSystem: DesignSystemWidget,
};
