/**
 * "Why is my grid empty / why didn't my rule fire?"
 *
 * The most common real question, and today it takes several manual tool calls
 * to work down the chain. The checks are pure functions over already-gathered
 * inputs so they're testable without a ConfigManager; `diagnose_grid` in the
 * executor does the gathering.
 */

export type FindingSeverity = 'blocker' | 'warning' | 'note';

export interface Finding {
  severity: FindingSeverity;
  /** What is wrong, in the user's terms. */
  what: string;
  /** What to do about it, naming the tool where there is one. */
  fix: string;
}

export interface DiagnosticInput {
  gridName: string;
  /** Provider bound to the live slot, if any. */
  providerId: string | null;
  /** Null when a provider is bound but its config row is gone. */
  provider: { name: string; providerType?: string; columnDefinitions?: unknown[]; keyColumn?: unknown } | null;
  /** Columns the feed produces plus calculated columns. */
  knownColumns: string[];
  /** Hidden via `initialHide` or the grid-state snapshot. */
  hiddenColumns: string[];
  conditionalRules: Array<{ id: string; name?: string; enabled?: boolean; expression?: string }>;
  calculatedColumns: Array<{ colId?: string; expression?: string }>;
  rowGroupColIds: string[];
}

/** Column refs in the expression DSL: `[colId]`, plus `.old` / `.new` suffixes. */
export function referencedColumns(expression: string): string[] {
  const refs = new Set<string>();
  for (const match of expression.matchAll(/\[([^\]]+)\]/g)) {
    const raw = match[1].trim();
    if (!raw) continue;
    refs.add(raw.replace(/\.(old|new)$/i, ''));
  }
  return [...refs];
}

export function diagnose(input: DiagnosticInput): Finding[] {
  const findings: Finding[] = [];

  // ── The empty-grid chain, in the order it breaks ──
  if (!input.providerId) {
    findings.push({
      severity: 'blocker',
      what: `"${input.gridName}" has no data provider bound, so it has nothing to show.`,
      fix: 'Bind one with set_grid_provider, or create one first with create_data_provider.',
    });
    return findings; // Everything downstream depends on a feed.
  }

  if (!input.provider) {
    findings.push({
      severity: 'blocker',
      what: `The bound provider (${input.providerId}) no longer exists — it was probably deleted.`,
      fix: 'Bind a different provider with set_grid_provider, or recreate that one.',
    });
    return findings;
  }

  const columnCount = input.provider.columnDefinitions?.length ?? 0;
  if (columnCount === 0) {
    findings.push({
      severity: 'blocker',
      what:
        `Provider "${input.provider.name}" has no columnDefinitions, so the grid renders EMPTY even while rows stream — ` +
        'the grid builds its columns from the provider config.',
      fix:
        input.provider.providerType === 'mock'
          ? 'Re-save the provider with update_data_provider; mock columns are inferred automatically.'
          : 'STOMP/REST need a live probe — open the Data Provider Editor and run Probe → Fields.',
    });
  }

  if (!input.provider.keyColumn) {
    findings.push({
      severity: 'warning',
      what: `Provider "${input.provider.name}" has no keyColumn, so rows have no identity and updates may duplicate instead of replacing.`,
      fix: 'Set keyColumn with update_data_provider (e.g. the cusip / positionId field).',
    });
  }

  // ── Things that make a populated grid still look wrong ──
  if (columnCount > 0 && input.hiddenColumns.length > 0) {
    const allHidden = input.knownColumns.length > 0 && input.hiddenColumns.length >= input.knownColumns.length;
    findings.push({
      severity: allHidden ? 'blocker' : 'note',
      what: allHidden
        ? 'Every column is hidden, so the grid looks empty even though it has data.'
        : `${input.hiddenColumns.length} column(s) are hidden: ${input.hiddenColumns.join(', ')}.`,
      fix: 'Un-hide them with set_column_layout { show: [...] }.',
    });
  }

  if (input.rowGroupColIds.length > 0) {
    findings.push({
      severity: 'note',
      what: `Rows are grouped by ${input.rowGroupColIds.join(' > ')}, so the grid shows group rows rather than flat data.`,
      fix: 'Clear it with set_row_grouping { groupBy: [] } if that was not intended.',
    });
  }

  // ── Rules that will never fire ──
  for (const rule of input.conditionalRules) {
    const label = rule.name ? `"${rule.name}"` : rule.id;
    if (rule.enabled === false) {
      findings.push({
        severity: 'note',
        what: `Styling rule ${label} is disabled.`,
        fix: 'Enable it with update_conditional_styling_rule { enabled: true }.',
      });
      continue;
    }
    const missing = referencedColumns(rule.expression ?? '').filter(
      (col) => input.knownColumns.length > 0 && !input.knownColumns.includes(col),
    );
    if (missing.length > 0) {
      findings.push({
        severity: 'warning',
        what: `Styling rule ${label} references ${missing.join(', ')}, which this feed doesn't produce — it will never match.`,
        fix: 'Point it at a real column (get_grid_columns) or remove it with remove_conditional_styling_rule.',
      });
    }
  }

  for (const col of input.calculatedColumns) {
    const missing = referencedColumns(col.expression ?? '').filter(
      (ref) => input.knownColumns.length > 0 && !input.knownColumns.includes(ref),
    );
    if (missing.length > 0) {
      findings.push({
        severity: 'warning',
        what: `Calculated column "${col.colId}" references ${missing.join(', ')}, which this feed doesn't produce — it will compute empty.`,
        fix: 'Fix the expression with add_calculated_column (same colId overwrites) or remove it.',
      });
    }
  }

  return findings;
}

/** One line for the tool card; the detail rides in `data`. */
export function summariseFindings(gridName: string, findings: Finding[]): string {
  if (findings.length === 0) return `No problems found on "${gridName}" — provider bound, columns defined, rules reference real fields.`;
  const blockers = findings.filter((f) => f.severity === 'blocker');
  const lead = blockers[0] ?? findings[0];
  const rest = findings.length - 1;
  return `${lead.what} ${lead.fix}${rest > 0 ? ` (+${rest} more finding(s))` : ''}`;
}
