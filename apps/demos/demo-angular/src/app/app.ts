import { Component, signal, effect, PLATFORM_ID, inject, Type, OnDestroy } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DockManagerCoreComponent, type DockTheme } from '@widgetstools/angular-dock-manager';
import {
  type DockManagerState,
  type DockviewApi,
  type LayoutNode,
  type PanelConfig,
  type Placement,
  collectAllPanelsOrdered,
  deserialize,
  findTabGroupForPanel,
  serialize,
  slateDark,
  vsCodeLight,
} from '@widgetstools/dock-manager-core';
import { TICKER_STRIP, type TickerItem } from './services/trading-data.service';
import { SharedStateService } from './services/shared-state.service';

// Widget imports
import { BondBlotterWidget } from './widgets/bond-blotter.widget';
import { ChartWidget } from './widgets/chart.widget';
import { OrderBookWidget } from './widgets/order-book.widget';
import { OrdersPanelWidget } from './widgets/orders-panel.widget';
import { TradeTicketWidget } from './widgets/trade-ticket.widget';
import { RfqWidget } from './widgets/rfq.widget';
import { RiskKpiWidget } from './widgets/risk-kpi.widget';
import { BookRiskWidget } from './widgets/book-risk.widget';
import { Dv01ChartWidget } from './widgets/dv01-chart.widget';
import { ScenarioChartWidget } from './widgets/scenario-chart.widget';
import { VarTrendWidget } from './widgets/var-trend.widget';
import { RiskLimitsWidget } from './widgets/risk-limits.widget';
import { MarketIndicesWidget } from './widgets/market-indices.widget';
import { EconCalendarWidget } from './widgets/econ-calendar.widget';
import { IntradayChartWidget } from './widgets/intraday-chart.widget';
import { YieldCurveWidget } from './widgets/yield-curve.widget';
import { OrderKpiWidget } from './widgets/order-kpi.widget';
import { OrderBlotterWidget } from './widgets/order-blotter.widget';
import { OrderDetailWidget } from './widgets/order-detail.widget';
import { OasDurationWidget } from './widgets/oas-duration.widget';
import { DurationBucketsWidget } from './widgets/duration-buckets.widget';
import { SectorAllocationWidget } from './widgets/sector-allocation.widget';
import { HistoricalOasWidget } from './widgets/historical-oas.widget';
import { OasDistributionWidget } from './widgets/oas-distribution.widget';
import { PnlAttributionWidget } from './widgets/pnl-attribution.widget';
import { ResearchListWidget } from './widgets/research-list.widget';
import { NoteDetailWidget } from './widgets/note-detail.widget';
import { DesignSystemWidget } from './widgets/design-system.widget';

// ── Widget registry ──
const WIDGETS: Record<string, Type<any>> = {
  chart: ChartWidget,
  orderBook: OrderBookWidget,
  tradeTicket: TradeTicketWidget,
  blotter: OrdersPanelWidget,
  rfq: RfqWidget,
  bondBlotter: BondBlotterWidget,
  riskKpi: RiskKpiWidget,
  bookRisk: BookRiskWidget,
  dv01: Dv01ChartWidget,
  scenario: ScenarioChartWidget,
  varTrend: VarTrendWidget,
  riskLimits: RiskLimitsWidget,
  indices: MarketIndicesWidget,
  econCal: EconCalendarWidget,
  intraday: IntradayChartWidget,
  yieldCurve: YieldCurveWidget,
  orderKpi: OrderKpiWidget,
  orderBlotter: OrderBlotterWidget,
  orderDetail: OrderDetailWidget,
  oasDur: OasDurationWidget,
  durBuckets: DurationBucketsWidget,
  sectors: SectorAllocationWidget,
  histOas: HistoricalOasWidget,
  oasDist: OasDistributionWidget,
  pnl: PnlAttributionWidget,
  researchList: ResearchListWidget,
  noteDetail: NoteDetailWidget,
  designSystem: DesignSystemWidget,
};

// ── Layout helpers ──
const p = (id: string, title: string, wt: string, closable = false) => ({
  id,
  title,
  widgetType: wt,
  closable,
});
const tg = (id: string, panels: string[], active?: string) => ({
  type: 'tabgroup' as const,
  id,
  panels,
  activePanel: active || panels[0],
});
const sp = (id: string, dir: 'horizontal' | 'vertical', sizes: number[], children: any[]) => ({
  type: 'split' as const,
  id,
  direction: dir,
  sizes,
  children,
});
const base = (
  layout: LayoutNode,
  panels: Record<string, PanelConfig>,
  active: string,
): DockManagerState => {
  const placements = new Map<string, Placement>();
  for (const panelId of collectAllPanelsOrdered(layout)) {
    const groupId = findTabGroupForPanel(layout, panelId);
    if (groupId) placements.set(panelId, { type: 'docked', groupId });
  }
  return {
    layout,
    panels: new Map(Object.entries(panels)),
    placements,
    nextZIndex: 100,
    activePaneId: active,
  };
};

// ── Per-tab layouts (identical to React) ──
function tradeLayout(): DockManagerState {
  return base(
    sp(
      'root',
      'vertical',
      [55, 45],
      [
        sp(
          'top',
          'horizontal',
          [32, 68],
          [tg('tg-blotter', ['bondBlotter']), tg('tg-chart', ['chart'])],
        ),
        sp(
          'bottom',
          'horizontal',
          [32, 68],
          [tg('tg-ob', ['orderBook']), tg('tg-orders', ['blotter'])],
        ),
      ],
    ),
    {
      bondBlotter: p('bondBlotter', 'Bond Blotter', 'bondBlotter'),
      chart: p('chart', 'Chart', 'chart'),
      orderBook: p('orderBook', 'Order Book', 'orderBook'),
      blotter: p('blotter', 'Orders', 'blotter'),
    },
    'bondBlotter',
  );
}
function pricesLayout(): DockManagerState {
  return base(
    sp(
      'root',
      'vertical',
      [65, 35],
      [
        tg('tg-blotter', ['bondBlotter']),
        sp(
          'bottom',
          'horizontal',
          [60, 40],
          [tg('tg-chart', ['chart']), tg('tg-ob', ['orderBook'])],
        ),
      ],
    ),
    {
      bondBlotter: p('bondBlotter', 'Bond Blotter', 'bondBlotter'),
      chart: p('chart', 'Chart', 'chart'),
      orderBook: p('orderBook', 'Order Book', 'orderBook'),
    },
    'bondBlotter',
  );
}
function riskLayout(): DockManagerState {
  return base(
    sp(
      'root',
      'vertical',
      [12, 88],
      [
        tg('tg-kpi', ['riskKpi']),
        sp(
          'body',
          'horizontal',
          [25, 50, 25],
          [
            tg('tg-book', ['bookRisk']),
            sp(
              'charts',
              'vertical',
              [50, 50],
              [
                sp(
                  'charts-top',
                  'horizontal',
                  [50, 50],
                  [tg('tg-dv01', ['dv01']), tg('tg-scenario', ['scenario'])],
                ),
                tg('tg-var', ['varTrend']),
              ],
            ),
            tg('tg-limits', ['riskLimits']),
          ],
        ),
      ],
    ),
    {
      riskKpi: p('riskKpi', 'Risk KPIs', 'riskKpi'),
      bookRisk: p('bookRisk', 'Book Risk & Heatmap', 'bookRisk'),
      dv01: p('dv01', 'DV01 by Book', 'dv01'),
      scenario: p('scenario', 'Rate Scenarios', 'scenario'),
      varTrend: p('varTrend', 'VaR Trend', 'varTrend'),
      riskLimits: p('riskLimits', 'Risk Limits', 'riskLimits'),
    },
    'riskKpi',
  );
}
function marketLayout(): DockManagerState {
  return base(
    sp(
      'root',
      'horizontal',
      [30, 70],
      [
        sp('left', 'vertical', [60, 40], [tg('tg-idx', ['indices']), tg('tg-cal', ['econCal'])]),
        sp(
          'right',
          'vertical',
          [55, 45],
          [tg('tg-intra', ['intraday']), tg('tg-yc', ['yieldCurve'])],
        ),
      ],
    ),
    {
      indices: p('indices', 'Market Indices', 'indices'),
      econCal: p('econCal', 'Economic Calendar', 'econCal'),
      intraday: p('intraday', 'Intraday Chart', 'intraday'),
      yieldCurve: p('yieldCurve', 'Yield Curve', 'yieldCurve'),
    },
    'indices',
  );
}
function ordersLayout(): DockManagerState {
  return base(
    sp(
      'root',
      'vertical',
      [12, 88],
      [
        tg('tg-kpi', ['orderKpi']),
        sp(
          'body',
          'horizontal',
          [75, 25],
          [tg('tg-blot', ['orderBlotter']), tg('tg-det', ['orderDetail'])],
        ),
      ],
    ),
    {
      orderKpi: p('orderKpi', 'Order KPIs', 'orderKpi'),
      orderBlotter: p('orderBlotter', 'Order Blotter', 'orderBlotter'),
      orderDetail: p('orderDetail', 'Order Detail', 'orderDetail'),
    },
    'orderBlotter',
  );
}
function analyticsLayout(): DockManagerState {
  return base(
    sp(
      'root',
      'vertical',
      [50, 50],
      [
        sp(
          'row1',
          'horizontal',
          [34, 33, 33],
          [tg('tg-oas', ['oasDur']), tg('tg-dur', ['durBuckets']), tg('tg-sec', ['sectors'])],
        ),
        sp(
          'row2',
          'horizontal',
          [34, 33, 33],
          [tg('tg-hist', ['histOas']), tg('tg-dist', ['oasDist']), tg('tg-pnl', ['pnl'])],
        ),
      ],
    ),
    {
      oasDur: p('oasDur', 'OAS vs Duration', 'oasDur'),
      durBuckets: p('durBuckets', 'Duration Buckets', 'durBuckets'),
      sectors: p('sectors', 'Sector Allocation', 'sectors'),
      histOas: p('histOas', 'CDX IG/HY Historical', 'histOas'),
      oasDist: p('oasDist', 'OAS Distribution', 'oasDist'),
      pnl: p('pnl', 'P&L Attribution', 'pnl'),
    },
    'oasDur',
  );
}
function researchLayout(): DockManagerState {
  return base(
    sp(
      'root',
      'horizontal',
      [30, 70],
      [tg('tg-list', ['researchList']), tg('tg-detail', ['noteDetail'])],
    ),
    {
      researchList: p('researchList', 'Research Notes', 'researchList'),
      noteDetail: p('noteDetail', 'Note Detail', 'noteDetail'),
    },
    'researchList',
  );
}

function designSystemLayout(): DockManagerState {
  return base(
    tg('tg-ds', ['designSystem']),
    {
      designSystem: p('designSystem', 'Design System', 'designSystem'),
    },
    'designSystem',
  );
}

// ── Layout persistence helpers ──
const STORAGE_PREFIX = 'fi-dock-';
function getSavedLayout(tab: string): DockManagerState | null {
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + tab);
    if (!saved) return null;
    const { state } = deserialize(JSON.parse(saved));
    return state;
  } catch {}
  return null;
}
function saveLayoutToStorage(tab: string, state: DockManagerState) {
  try {
    localStorage.setItem(STORAGE_PREFIX + tab, serialize(state));
  } catch {}
}
function clearSavedLayout(tab: string) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + tab);
  } catch {}
}

const TAB_LAYOUTS: Record<string, () => DockManagerState> = {
  Trade: tradeLayout,
  Prices: pricesLayout,
  Risk: riskLayout,
  Market: marketLayout,
  Research: researchLayout,
  Orders: ordersLayout,
  Analytics: analyticsLayout,
  'Design System': designSystemLayout,
};

const NAV_TABS = [
  'Prices',
  'Trade',
  'Risk',
  'Market',
  'Research',
  'Orders',
  'Analytics',
  'Design System',
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, DockManagerCoreComponent],
  template: `
    <!-- Top Bar -->
    <div
      data-nav
      style="flex-shrink:0;background:var(--ds-surface-primary);border-bottom:1px solid var(--ds-border-primary)"
    >
      <!-- Main nav bar -->
      <div
        style="display:flex;align-items:center;height:44px;padding:0 16px;gap:0;border-bottom:1px solid var(--ds-border-primary)"
      >
        <!-- Logo -->
        <div style="display:flex;align-items:center;gap:8px;margin-right:24px;flex-shrink:0">
          <svg width="22" height="22" viewBox="0 0 64 64">
            <polygon points="11,18 19,14 19,33 11,33" fill="#a5c3e1" />
            <polygon points="11,33 19,33 19,52 11,52" fill="#4ba5c3" />
            <polygon points="21,30 29,26 29,52 21,52" fill="#ff870f" />
            <polygon points="31,26 39,30 39,52 31,52" fill="#ff0f0f" />
            <polygon points="41,14 49,18 49,33 41,33" fill="#a5c3e1" />
            <polygon points="41,33 49,33 49,52 41,52" fill="#4ba5c3" />
            <rect x="11" y="52" width="38" height="2" fill="#2d4b69" />
          </svg>
          <span style="font-weight:700;font-size:13px;letter-spacing:0.04em;color:var(--ds-text-primary)"
            >MarketsUI <span style="color:var(--ds-accent-info)">FI</span></span
          >
        </div>
        <!-- Nav tabs -->
        <button
          *ngFor="let t of navTabs"
          (click)="setActiveTab(t)"
          class="bn-tab"
          [class.active]="activeTab() === t"
        >
          {{ t }}
        </button>
        <!-- Right side -->
        <div style="margin-left:auto;display:flex;align-items:center;gap:10px">
          <ng-container *ngIf="isTrading">
            <button
              (click)="handleNewOrder()"
              style="font-size:11px;padding:4px 12px;border-radius:3px;background:var(--ds-surface-tertiary);color:var(--ds-text-primary);cursor:pointer;border:1px solid var(--ds-border-secondary);white-space:nowrap;font-family:JetBrains Mono,monospace;font-weight:600"
            >
              + New Order
            </button>
            <button
              (click)="handleOpenRfq()"
              style="font-size:11px;padding:4px 12px;border-radius:3px;background:var(--ds-surface-tertiary);color:var(--ds-text-primary);cursor:pointer;border:1px solid var(--ds-border-secondary);white-space:nowrap;font-family:JetBrains Mono,monospace;font-weight:600"
            >
              RFQ
            </button>
            <div style="width:1px;height:14px;background:var(--ds-border-primary);flex-shrink:0"></div>
          </ng-container>
          <!-- LIVE indicator -->
          <div style="display:flex;align-items:center;gap:6px">
            <div
              class="live-dot"
              style="width:6px;height:6px;border-radius:50%;background:var(--ds-accent-positive)"
            ></div>
            <span class="font-mono-fi" style="color:var(--ds-accent-positive);font-size:11px">LIVE</span>
          </div>
          <div style="width:1px;height:14px;background:var(--ds-border-primary);flex-shrink:0"></div>
          <!-- Clock -->
          <span class="font-mono-fi" style="color:var(--ds-text-secondary);font-size:11px">{{ time() }}</span>
          <div style="width:1px;height:14px;background:var(--ds-border-primary);flex-shrink:0"></div>
          <!-- Save layout -->
          <button
            (click)="saveLayout()"
            title="Save layout"
            style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:4px;border:none;cursor:pointer;transition:all 0.15s ease"
            [style.background]="saveFlash() ? 'rgba(20,217,160,0.25)' : 'var(--ds-surface-tertiary)'"
            [style.color]="saveFlash() ? 'var(--ds-accent-positive)' : 'var(--ds-text-secondary)'"
            [style.transform]="saveFlash() ? 'scale(0.9)' : 'scale(1)'"
          >
            @if (saveFlash()) {
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            } @else {
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
                />
                <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
                <path d="M7 3v4a1 1 0 0 0 1 1h7" />
              </svg>
            }
          </button>
          <!-- Reset layout -->
          <button
            (click)="resetLayout()"
            title="Reset layout"
            aria-label="Reset layout"
            style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:4px;background:var(--ds-surface-tertiary);color:var(--ds-text-secondary);border:none;cursor:pointer"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          <!-- Theme toggle -->
          <button
            (click)="toggleTheme()"
            style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:4px;background:var(--ds-surface-tertiary);color:var(--ds-text-secondary);border:none;cursor:pointer;font-size:13px"
            [title]="isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            {{ isDark() ? '☀' : '☽' }}
          </button>
        </div>
      </div>

      <!-- Instrument stats strip (Trade/Prices tabs) -->
      <div
        *ngIf="isTrading"
        style="display:flex;align-items:center;height:36px;border-bottom:1px solid var(--ds-border-primary);padding:0 16px;gap:16px"
      >
        <div
          *ngFor="let s of statsStrip; let i = index; let last = last"
          style="display:flex;align-items:center;flex-shrink:0;gap:5px"
          [style.paddingRight.px]="last ? 0 : 12"
          [style.borderRight]="last ? 'none' : '1px solid var(--ds-border-primary)'"
          [style.width.px]="s.w"
        >
          <span style="font-size:9px;color:var(--ds-text-muted);white-space:nowrap;flex-shrink:0">{{
            s.label
          }}</span>
          <span
            class="font-mono-fi font-semibold"
            style="font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums"
            [style.color]="s.color"
            >{{ s.val }}</span
          >
        </div>
        <div style="width:1px;height:18px;background:var(--ds-border-primary);flex-shrink:0"></div>
        <!-- Ticker strip (compact, right side) -->
        <div style="display:flex;align-items:center;overflow:hidden;gap:4px;margin-left:auto">
          <div
            *ngFor="let t of tickerStrip().slice(0, 8)"
            style="display:flex;align-items:center;padding:3px 7px;border-radius:3px;gap:5px;background:var(--ds-surface-secondary);flex-shrink:0"
          >
            <span style="font-size:9px;color:var(--ds-text-muted);white-space:nowrap">{{ t.label }}</span>
            <span
              class="font-mono-fi font-semibold"
              style="font-size:11px;color:var(--ds-text-primary);white-space:nowrap"
              >{{ t.value }}</span
            >
            <span
              class="font-mono-fi"
              style="font-size:9px;white-space:nowrap"
              [style.color]="t.up ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)'"
              >{{ t.change }}</span
            >
          </div>
        </div>
      </div>

      <!-- Ticker strip only (non-trade tabs) -->
      <div
        *ngIf="!isTrading"
        style="display:flex;align-items:stretch;overflow:hidden;height:38px;border-bottom:1px solid var(--ds-border-primary)"
      >
        <div
          *ngFor="let t of tickerStrip()"
          style="display:flex;align-items:center;gap:8px;padding:0 12px;border-right:1px solid var(--ds-border-primary)"
        >
          <span style="font-size:11px;color:var(--ds-text-muted);white-space:nowrap">{{ t.label }}</span>
          <span
            class="font-mono-fi font-semibold"
            style="font-size:11px;color:var(--ds-text-primary);white-space:nowrap"
            >{{ t.value }}</span
          >
          <span
            class="font-mono-fi"
            style="font-size:11px;white-space:nowrap"
            [style.color]="t.up ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)'"
            >{{ t.change }}</span
          >
        </div>
      </div>
    </div>

    <!-- Dock Manager (switches per tab via ngIf + key) -->
    <div style="flex:1;overflow:hidden">
      @for (tab of navTabs; track tab) {
        @if (activeTab() === tab && layoutVersion()) {
          <dock-manager-core
            [initialState]="getLayout(tab)"
            [widgets]="widgets"
            [theme]="dockTheme"
            (ready)="onDockReady($event)"
            (stateChange)="onDockStateChange($event)"
          />
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100vh;
        width: 100vw;
        overflow: hidden;
        background: var(--ds-surface-ground);
      }
    `,
  ],
})
export class App implements OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private shared = inject(SharedStateService);

  navTabs = NAV_TABS;
  activeTab = signal('Trade');
  isDark = signal(true);
  layoutVersion = signal(1);
  saveFlash = signal(false);
  private lastDockState: DockManagerState | null = null;
  time = signal('');
  tickerStrip = signal<TickerItem[]>(TICKER_STRIP.map((t) => ({ ...t })));
  widgets = WIDGETS;
  dockTheme: DockTheme = slateDark;
  private dockApi: DockviewApi | null = null;
  private clockId: any;
  private tickerId: any;

  get isTrading() {
    return this.activeTab() === 'Trade' || this.activeTab() === 'Prices';
  }

  get statsStrip() {
    const bond = this.shared.selectedBond();
    const mid = (bond.bid + bond.ask) / 2;
    const change24h = +(Math.random() * 0.4 - 0.2).toFixed(2);
    const pctChg = +((change24h / mid) * 100).toFixed(2);
    return [
      {
        label: 'Security',
        val: `${bond.ticker} ${bond.cpn.toFixed(3)} ${bond.mat}`,
        color: 'var(--ds-accent-info)',
        w: 130,
      },
      {
        label: 'Mid',
        val: mid.toFixed(3),
        color: pctChg >= 0 ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)',
        w: 72,
      },
      { label: 'Bid', val: bond.bid.toFixed(3), color: 'var(--ds-text-primary)', w: 72 },
      { label: 'Ask', val: bond.ask.toFixed(3), color: 'var(--ds-text-primary)', w: 72 },
      {
        label: 'Chg',
        val: `${pctChg >= 0 ? '+' : ''}${change24h.toFixed(2)} (${pctChg >= 0 ? '+' : ''}${pctChg.toFixed(2)}%)`,
        color: pctChg >= 0 ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)',
        w: 120,
      },
      {
        label: 'OAS',
        val: bond.oas > 0 ? `+${bond.oas}bp` : '---',
        color: bond.oas > 80 ? 'var(--ds-accent-warning)' : 'var(--ds-accent-positive)',
        w: 52,
      },
      { label: 'Dur', val: `${bond.dur?.toFixed(2) ?? '---'}yr`, color: 'var(--ds-text-primary)', w: 56 },
    ];
  }

  constructor() {
    effect(() => {
      if (isPlatformBrowser(this.platformId)) {
        const mode = this.isDark() ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', mode);
        document.body.dataset['agThemeMode'] = mode;
      }
    });
    effect(() => {
      this.dockTheme = this.isDark() ? slateDark : vsCodeLight;
    });
    // Clock
    const updateClock = () => {
      this.time.set(
        new Date().toLocaleTimeString('en-US', {
          hour12: false,
          timeZone: 'America/New_York',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' ET',
      );
    };
    updateClock();
    this.clockId = setInterval(updateClock, 1000);

    // Tick the ticker strip values
    this.tickerId = setInterval(() => {
      this.tickerStrip.set(
        this.tickerStrip().map((t) => {
          if (Math.random() < 0.3) {
            const delta = (Math.random() - 0.5) * 0.04;
            const oldVal = parseFloat(t.value);
            const newVal = +(oldVal + delta).toFixed(2);
            const chgVal = +(parseFloat(t.change) + delta).toFixed(2);
            return {
              ...t,
              value: newVal.toFixed(2),
              change: (chgVal >= 0 ? '+' : '') + chgVal.toFixed(2),
              up: chgVal >= 0,
            };
          }
          return t;
        }),
      );
    }, 2000);
  }

  setActiveTab(t: string) {
    this.activeTab.set(t);
    if (t !== 'Trade') this.shared.showRfq.set(false);
  }

  toggleTheme() {
    this.isDark.update((v) => !v);
  }

  getLayout(tab: string): DockManagerState {
    const saved = getSavedLayout(tab);
    if (saved) return saved;
    return (TAB_LAYOUTS[tab] || tradeLayout)();
  }

  onDockReady(api: DockviewApi) {
    this.dockApi = api;
  }

  onDockStateChange(state: DockManagerState) {
    this.lastDockState = state;
  }

  saveLayout() {
    if (this.lastDockState) {
      saveLayoutToStorage(this.activeTab(), this.lastDockState);
      this.saveFlash.set(true);
      setTimeout(() => this.saveFlash.set(false), 800);
    }
  }

  resetLayout() {
    clearSavedLayout(this.activeTab());
    this.lastDockState = null;
    // Force remount by toggling layoutVersion
    this.layoutVersion.set(0);
    setTimeout(() => this.layoutVersion.set(1));
  }

  handleNewOrder() {
    if (!this.dockApi) return;
    if (this.dockApi.hasPanel('tradeTicket')) {
      const gid = this.dockApi.getGroupForPanel('tradeTicket');
      if (gid) this.dockApi.setActivePanel(gid, 'tradeTicket');
      this.dockApi.setActivePane('tradeTicket');
    } else {
      this.dockApi.addPanel({
        id: 'tradeTicket',
        title: 'Trade Ticket',
        widgetType: 'tradeTicket',
        closable: true,
        dockable: false,
      });
      this.dockApi.floatPanel({ panelId: 'tradeTicket', x: 300, y: 80, width: 280, height: 520 });
    }
  }

  handleOpenRfq() {
    if (!this.dockApi) return;
    if (this.dockApi.hasPanel('rfq')) {
      const gid = this.dockApi.getGroupForPanel('rfq');
      if (gid) this.dockApi.setActivePanel(gid, 'rfq');
      this.dockApi.setActivePane('rfq');
      this.dockApi.bringToFront('rfq');
    } else {
      this.dockApi.addPanel({
        id: 'rfq',
        title: 'RFQ Workbench',
        widgetType: 'rfq',
        closable: true,
        dockable: false,
      });
      this.dockApi.floatPanel({ panelId: 'rfq', x: 80, y: 50, width: 820, height: 540 });
    }
  }

  ngOnDestroy() {
    if (this.clockId) clearInterval(this.clockId);
    if (this.tickerId) clearInterval(this.tickerId);
  }
}
