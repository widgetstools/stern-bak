/**
 * Icon list for the dock editor.
 *
 * Two sources:
 * 1. Custom market icons from @wellsfargo-starui/icons-svg (prefixed "mkt:")
 * 2. Generic Lucide icons via Iconify CDN (prefixed "lucide:")
 *
 * Custom icons are rendered as inline data URLs from SVG strings.
 * Lucide icons are fetched from the Iconify CDN.
 */

export interface IconOption {
  /** Display name shown in the picker (e.g. "Bond") */
  name: string;
  /** Icon ID in prefix:name format (e.g. "mkt:bond" or "lucide:home") */
  icon: string;
}

export const ICON_OPTIONS: IconOption[] = [

  // ─── Custom Market Icons (@wellsfargo-starui/icons-svg) ───────────────────
  // Trading
  { name: "Bond", icon: "mkt:bond" },
  { name: "Candlestick", icon: "mkt:candlestick" },
  { name: "Coupon", icon: "mkt:coupon" },
  { name: "Credit Rating", icon: "mkt:credit-rating" },
  { name: "Duration", icon: "mkt:duration" },
  { name: "Execute Trade", icon: "mkt:execute-trade" },
  { name: "Interest Rate", icon: "mkt:interest-rate" },
  { name: "IPO", icon: "mkt:ipo" },
  { name: "Live Feed", icon: "mkt:live-feed" },
  { name: "Market Depth", icon: "mkt:market-depth" },
  { name: "Maturity", icon: "mkt:maturity" },
  { name: "Order Book", icon: "mkt:order-book" },
  { name: "Portfolio", icon: "mkt:portfolio" },
  { name: "Position", icon: "mkt:position" },
  { name: "Price Alert", icon: "mkt:price-alert" },
  { name: "Spread", icon: "mkt:spread" },
  { name: "Stock", icon: "mkt:stock" },
  { name: "Ticker", icon: "mkt:ticker" },
  { name: "Trade Ticket", icon: "mkt:trade-ticket" },
  { name: "Watchlist", icon: "mkt:watchlist" },
  { name: "Yield Curve", icon: "mkt:yield-curve" },
  // Blotters
  { name: "Allocation Blotter", icon: "mkt:allocation-blotter" },
  { name: "Audit Blotter", icon: "mkt:audit-blotter" },
  { name: "Block Trade Blotter", icon: "mkt:block-trade-blotter" },
  { name: "Cash Blotter", icon: "mkt:cash-blotter" },
  { name: "Commodities Blotter", icon: "mkt:commodities-blotter" },
  { name: "Derivatives Blotter", icon: "mkt:derivatives-blotter" },
  { name: "Equity Blotter", icon: "mkt:equity-blotter" },
  { name: "Execution Blotter", icon: "mkt:execution-blotter" },
  { name: "Fixed Income Blotter", icon: "mkt:fi-blotter" },
  { name: "FX Blotter", icon: "mkt:fx-blotter" },
  { name: "Order Blotter", icon: "mkt:order-blotter" },
  { name: "Pending Blotter", icon: "mkt:pending-blotter" },
  { name: "P&L Blotter", icon: "mkt:pnl-blotter" },
  { name: "Position Blotter", icon: "mkt:position-blotter" },
  { name: "Rejected Blotter", icon: "mkt:rejected-blotter" },
  { name: "Risk Blotter", icon: "mkt:risk-blotter" },
  { name: "Settlement Blotter", icon: "mkt:settlement-blotter" },
  { name: "Trade Blotter", icon: "mkt:trade-blotter" },
  // Charts
  { name: "Area Chart", icon: "mkt:area-chart" },
  { name: "Bar Chart", icon: "mkt:bar-chart" },
  { name: "Blotter", icon: "mkt:blotter" },
  { name: "Heatmap", icon: "mkt:heatmap" },
  { name: "Line Chart", icon: "mkt:line-chart" },
  { name: "Waterfall", icon: "mkt:waterfall" },
  // Risk
  { name: "Compliance", icon: "mkt:compliance" },
  { name: "Counterparty", icon: "mkt:counterparty" },
  { name: "Drawdown", icon: "mkt:drawdown" },
  { name: "Exposure Map", icon: "mkt:exposure-map" },
  { name: "Hedging", icon: "mkt:hedging" },
  { name: "Limits", icon: "mkt:limits" },
  { name: "Risk", icon: "mkt:risk" },
  { name: "Risk Gauge", icon: "mkt:risk-gauge" },
  { name: "Scenarios", icon: "mkt:scenarios" },
  { name: "Stress Test", icon: "mkt:stress-test" },
  { name: "Volatility", icon: "mkt:volatility" },
  // General
  { name: "Alert", icon: "mkt:alert" },
  { name: "Analytics", icon: "mkt:analytics" },
  { name: "Bank", icon: "mkt:bank" },
  { name: "Calculator", icon: "mkt:calculator" },
  { name: "Clock", icon: "mkt:clock" },
  { name: "Currency", icon: "mkt:currency" },
  { name: "Dashboard", icon: "mkt:dashboard" },
  { name: "Globe", icon: "mkt:globe" },
  { name: "Market Data", icon: "mkt:market-data" },
  { name: "Notifications", icon: "mkt:notifications" },
  { name: "Percentage", icon: "mkt:percentage" },
  { name: "P&L", icon: "mkt:pnl" },
  { name: "Reports", icon: "mkt:reports" },
  { name: "Settings", icon: "mkt:settings" },
  { name: "Trending Down", icon: "mkt:trending-down" },
  { name: "Trending Up", icon: "mkt:trending-up" },
  // System
  { name: "Code", icon: "mkt:code" },
  { name: "Download", icon: "mkt:download" },
  { name: "Eye", icon: "mkt:eye" },
  { name: "Moon", icon: "mkt:moon" },
  { name: "Refresh", icon: "mkt:refresh" },
  { name: "Sun", icon: "mkt:sun" },
  { name: "Upload", icon: "mkt:upload" },
  { name: "Wrench", icon: "mkt:wrench" },

  // ─── Generic Lucide Icons (Iconify CDN) ────────────────────────────
  // Files & Editing
  { name: "FileText", icon: "lucide:file-text" },
  { name: "File", icon: "lucide:file" },
  { name: "FilePlus", icon: "lucide:file-plus" },
  { name: "FolderOpen", icon: "lucide:folder-open" },
  { name: "Folder", icon: "lucide:folder" },
  { name: "Save", icon: "lucide:save" },
  { name: "Copy", icon: "lucide:copy" },
  { name: "Clipboard", icon: "lucide:clipboard" },
  { name: "Scissors", icon: "lucide:scissors" },
  { name: "Pencil", icon: "lucide:pencil" },
  { name: "Trash", icon: "lucide:trash-2" },
  { name: "Undo", icon: "lucide:undo" },
  { name: "Redo", icon: "lucide:redo" },
  // UI & Navigation
  { name: "Search", icon: "lucide:search" },
  { name: "Layout", icon: "lucide:layout" },
  { name: "LayoutGrid", icon: "lucide:layout-grid" },
  { name: "Columns", icon: "lucide:columns-3" },
  { name: "Maximize", icon: "lucide:maximize" },
  { name: "Plus", icon: "lucide:plus" },
  { name: "Check", icon: "lucide:check" },
  { name: "X", icon: "lucide:x" },
  { name: "Menu", icon: "lucide:menu" },
  { name: "Home", icon: "lucide:home" },
  // Communication
  { name: "Bell", icon: "lucide:bell" },
  { name: "Mail", icon: "lucide:mail" },
  { name: "Send", icon: "lucide:send" },
  { name: "MessageSquare", icon: "lucide:message-square" },
  // People & Security
  { name: "User", icon: "lucide:user" },
  { name: "Users", icon: "lucide:users" },
  { name: "Lock", icon: "lucide:lock" },
  { name: "Key", icon: "lucide:key" },
  { name: "Shield", icon: "lucide:shield" },
  // Data & Dev
  { name: "Terminal", icon: "lucide:terminal" },
  { name: "Code", icon: "lucide:code" },
  { name: "Database", icon: "lucide:database" },
  { name: "Server", icon: "lucide:server" },
  { name: "Table", icon: "lucide:table" },
  { name: "Filter", icon: "lucide:filter" },
  { name: "Workflow", icon: "lucide:workflow" },
  { name: "GitBranch", icon: "lucide:git-branch" },
  // Misc
  { name: "Star", icon: "lucide:star" },
  { name: "Bookmark", icon: "lucide:bookmark" },
  { name: "Flag", icon: "lucide:flag" },
  { name: "Tag", icon: "lucide:tag" },
  { name: "Zap", icon: "lucide:zap" },
  { name: "Activity", icon: "lucide:activity" },
  { name: "Calendar", icon: "lucide:calendar" },
  { name: "Info", icon: "lucide:info" },
  { name: "HelpCircle", icon: "lucide:help-circle" },
  { name: "AlertTriangle", icon: "lucide:alert-triangle" },
  { name: "Power", icon: "lucide:power" },
  { name: "Link", icon: "lucide:link" },
  { name: "ExternalLink", icon: "lucide:external-link" },
  { name: "Layers", icon: "lucide:layers" },
  { name: "Package", icon: "lucide:package" },
  { name: "Target", icon: "lucide:target" },
  { name: "Compass", icon: "lucide:compass" },
  { name: "Image", icon: "lucide:image" },
  { name: "Palette", icon: "lucide:palette" },
  { name: "Monitor", icon: "lucide:monitor" },
];

export const DEFAULT_ICON = ICON_OPTIONS[0];

export function findIconByName(name: string): IconOption | undefined {
  return ICON_OPTIONS.find((i) => i.name === name);
}

export function findIconById(iconId: string): IconOption | undefined {
  return ICON_OPTIONS.find((i) => i.icon === iconId);
}
