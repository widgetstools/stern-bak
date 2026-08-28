import { describe, expect, it } from 'vitest';
import { diagnose, referencedColumns, summariseFindings, type DiagnosticInput } from './diagnostics';

/** A grid with nothing wrong with it. */
function healthy(over: Partial<DiagnosticInput> = {}): DiagnosticInput {
  return {
    gridName: 'Axe Blotter',
    providerId: 'p1',
    provider: { name: 'Desk feed', providerType: 'mock', columnDefinitions: [{}, {}], keyColumn: 'cusip' },
    knownColumns: ['cusip', 'ticker', 'marketValue'],
    hiddenColumns: [],
    conditionalRules: [],
    calculatedColumns: [],
    rowGroupColIds: [],
    ...over,
  };
}

describe('referencedColumns', () => {
  it('reads plain and diff-suffixed column refs', () => {
    expect(referencedColumns('[marketValue.new] > [marketValue.old]')).toEqual(['marketValue']);
    expect(referencedColumns('[bid] - [ask] > 0.1').sort()).toEqual(['ask', 'bid']);
  });

  it('ignores expressions with no refs', () => {
    expect(referencedColumns('value < 0')).toEqual([]);
    expect(referencedColumns('')).toEqual([]);
  });
});

describe('diagnose — the empty-grid chain', () => {
  it('finds nothing wrong with a healthy grid', () => {
    expect(diagnose(healthy())).toEqual([]);
  });

  it('stops at the missing provider rather than piling on downstream noise', () => {
    const findings = diagnose(healthy({ providerId: null, provider: null }));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('blocker');
    expect(findings[0].fix).toContain('set_grid_provider');
  });

  it('reports a provider that was deleted out from under the grid', () => {
    const findings = diagnose(healthy({ provider: null }));
    expect(findings[0].what).toContain('no longer exists');
  });

  /** The classic: rows stream, grid looks empty, nothing errors anywhere. */
  it('calls out missing columnDefinitions as a blocker and adapts the fix to the provider type', () => {
    const mock = diagnose(healthy({ provider: { name: 'M', providerType: 'mock', columnDefinitions: [], keyColumn: 'cusip' } }));
    expect(mock[0].severity).toBe('blocker');
    expect(mock[0].fix).toContain('update_data_provider');

    const stomp = diagnose(healthy({ provider: { name: 'S', providerType: 'stomp', columnDefinitions: [], keyColumn: 'cusip' } }));
    expect(stomp[0].fix).toContain('Probe');
  });

  it('warns about a missing keyColumn without treating it as fatal', () => {
    const findings = diagnose(healthy({ provider: { name: 'M', providerType: 'mock', columnDefinitions: [{}], keyColumn: undefined } }));
    expect(findings.map((f) => f.severity)).toEqual(['warning']);
    expect(findings[0].what).toContain('keyColumn');
  });
});

describe('diagnose — a populated grid that still looks wrong', () => {
  it('escalates to a blocker when every column is hidden', () => {
    const findings = diagnose(healthy({ hiddenColumns: ['cusip', 'ticker', 'marketValue'] }));
    expect(findings[0].severity).toBe('blocker');
    expect(findings[0].what).toContain('Every column is hidden');
  });

  it('mentions a few hidden columns only as a note', () => {
    const findings = diagnose(healthy({ hiddenColumns: ['ticker'] }));
    expect(findings[0].severity).toBe('note');
    expect(findings[0].fix).toContain('set_column_layout');
  });

  it('explains active row grouping, which reads as "wrong" to someone who did not expect it', () => {
    const findings = diagnose(healthy({ rowGroupColIds: ['issuerSector'] }));
    expect(findings[0].what).toContain('grouped by issuerSector');
  });
});

describe('diagnose — rules that can never fire', () => {
  it('flags a rule referencing a column the feed does not produce', () => {
    const findings = diagnose(healthy({
      conditionalRules: [{ id: 'r1', name: 'Wide spread', enabled: true, expression: '[bidAskWidthBps] > 50' }],
    }));
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].what).toContain('bidAskWidthBps');
    expect(findings[0].what).toContain('never match');
  });

  it('reports a disabled rule as a note and does not also check its columns', () => {
    const findings = diagnose(healthy({
      conditionalRules: [{ id: 'r1', name: 'Off', enabled: false, expression: '[nope] > 1' }],
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('note');
  });

  it('flags a calculated column built on an unknown field', () => {
    const findings = diagnose(healthy({
      calculatedColumns: [{ colId: 'notional', expression: '[price] * [quantity]' }],
    }));
    expect(findings[0].what).toContain('notional');
    expect(findings[0].what).toContain('price');
  });

  /** With no column list to check against, guessing would be worse than silence. */
  it('does not accuse rules when the column list is unknown', () => {
    const findings = diagnose(healthy({
      knownColumns: [],
      conditionalRules: [{ id: 'r1', enabled: true, expression: '[anything] > 1' }],
    }));
    expect(findings).toEqual([]);
  });
});

describe('summariseFindings', () => {
  it('says so plainly when nothing is wrong', () => {
    expect(summariseFindings('Axe', [])).toContain('No problems found');
  });

  it('leads with the blocker, not the first finding', () => {
    const summary = summariseFindings('Axe', [
      { severity: 'note', what: 'A note.', fix: 'Ignore.' },
      { severity: 'blocker', what: 'No provider bound.', fix: 'Bind one.' },
    ]);
    expect(summary.startsWith('No provider bound.')).toBe(true);
    expect(summary).toContain('+1 more');
  });
});

/**
 * "Where did my columns go?" is the question a grouped blotter provokes, so
 * the diagnostic has to separate columns the VIEW hid from columns the user
 * hid — the fixes are opposites: flatten the grid vs un-hide one column.
 */
describe('diagnose — grouped and pivoted views', () => {
  it('reports view-hidden columns as expected, and points at flattening rather than un-hiding', () => {
    const findings = diagnose(healthy({
      rowGroupColIds: ['issuerSector'],
      hiddenColumns: ['issuerSector', 'ticker'],
      autoHiddenColIds: ['issuerSector', 'ticker'],
    }));

    const hiddenNote = findings.find((f) => f.what.includes('hidden BY the grouped'));
    expect(hiddenNote).toBeDefined();
    expect(hiddenNote!.severity).toBe('note');
    expect(hiddenNote!.what).toContain('expected, not a fault');
    expect(hiddenNote!.fix).toContain('groupBy: []');
    // The generic "un-hide them" advice would have the reader fighting the view.
    expect(findings.some((f) => f.fix?.includes('set_column_layout'))).toBe(false);
  });

  it('still reports columns the user hid by hand, separately from the view', () => {
    const findings = diagnose(healthy({
      rowGroupColIds: ['issuerSector'],
      hiddenColumns: ['issuerSector', 'cusip'],
      autoHiddenColIds: ['issuerSector'],
    }));

    const byHand = findings.find((f) => f.fix?.includes('set_column_layout'));
    expect(byHand).toBeDefined();
    expect(byHand!.what).toContain('cusip');
    expect(byHand!.what).not.toContain('issuerSector');
  });

  it('describes a pivot by both of its dimensions', () => {
    const findings = diagnose(healthy({
      rowGroupColIds: ['issuerSector'],
      pivotColIds: ['currency'],
      pivotMode: true,
    }));

    const note = findings.find((f) => f.what.includes('Pivoting'));
    expect(note).toBeDefined();
    expect(note!.what).toContain('rows by issuerSector');
    expect(note!.what).toContain('columns by currency');
  });

  /** Without the grouping context this is the old, misleading advice. */
  it('falls back to plain hidden-column advice on an ungrouped grid', () => {
    const findings = diagnose(healthy({ hiddenColumns: ['ticker'] }));
    expect(findings[0].fix).toContain('set_column_layout');
  });
});
