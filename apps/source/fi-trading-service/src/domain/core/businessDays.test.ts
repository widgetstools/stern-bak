
import { describe, expect, it } from 'vitest';

import {
  addBusinessDays, adjust, businessDaysBetween, businessDaysInRange, nextBusinessDay,
  previousBusinessDay, rollBackward, rollForward, settlementDate,
} from './businessDays.js';
import { SifmaCalendar, WeekendOnlyCalendar } from './sifmaCalendar.js';

const cal = new SifmaCalendar();

describe('rolling', () => {
  it('steps to the next and previous business day', () => {
    expect(nextBusinessDay(cal, 20260313)).toBe(20260316); // Fri -> Mon
    expect(previousBusinessDay(cal, 20260316)).toBe(20260313);
  });

  it('leaves a business day alone but moves a closed one', () => {
    expect(rollForward(cal, 20260316)).toBe(20260316);
    expect(rollForward(cal, 20260314)).toBe(20260316); // Sat -> Mon
    expect(rollBackward(cal, 20260315)).toBe(20260313); // Sun -> Fri
  });

  it('rolls over a holiday, not just a weekend', () => {
    // Thanksgiving 2026 is Thursday 26 November.
    expect(rollForward(cal, 20261126)).toBe(20261127);
    expect(nextBusinessDay(cal, 20261125)).toBe(20261127);
  });
});

describe('conventions', () => {
  it('leaves unadjusted dates untouched, which accrual depends on', () => {
    expect(adjust(cal, 20260314, 'Unadjusted')).toBe(20260314);
  });

  it('follows and precedes', () => {
    expect(adjust(cal, 20260314, 'Following')).toBe(20260316);
    expect(adjust(cal, 20260314, 'Preceding')).toBe(20260313);
  });

  it('modified following turns back rather than leaving the month', () => {
    // 31 May 2026 is a Sunday; rolling forward would land in June.
    expect(adjust(cal, 20260531, 'Following')).toBe(20260601);
    expect(adjust(cal, 20260531, 'ModifiedFollowing')).toBe(20260529);
  });

  it('modified preceding turns forward rather than leaving the month', () => {
    // 1 March 2026 is a Sunday; rolling back would land in February.
    expect(adjust(cal, 20260301, 'Preceding')).toBe(20260227);
    expect(adjust(cal, 20260301, 'ModifiedPreceding')).toBe(20260302);
  });
});

describe('counting and stepping', () => {
  it('adds and subtracts business days across weekends', () => {
    expect(addBusinessDays(cal, 20260313, 1)).toBe(20260316);
    expect(addBusinessDays(cal, 20260316, -1)).toBe(20260313);
    expect(addBusinessDays(cal, 20260316, 5)).toBe(20260323);
  });

  it('skips holidays when stepping', () => {
    // Wednesday 25 Nov 2026, +1 skips Thanksgiving.
    expect(addBusinessDays(cal, 20261125, 1)).toBe(20261127);
  });

  it('rolls a closed day onto a session when asked for zero steps', () => {
    expect(addBusinessDays(cal, 20260314, 0)).toBe(20260316);
    expect(addBusinessDays(cal, 20260316, 0)).toBe(20260316);
  });

  it('counts business days in a span, signed', () => {
    expect(businessDaysBetween(cal, 20260316, 20260323)).toBe(5);
    expect(businessDaysBetween(cal, 20260323, 20260316)).toBe(-5);
    expect(businessDaysBetween(cal, 20260316, 20260316)).toBe(0);
  });

  it('lists the sessions in a range, inclusive of both ends', () => {
    const week = businessDaysInRange(cal, 20260316, 20260322);
    expect(week).toEqual([20260316, 20260317, 20260318, 20260319, 20260320]);
  });
});

describe('settlement', () => {
  it('settles T+1 into the next session', () => {
    expect(settlementDate(cal, 20260316, 1)).toBe(20260317);
  });

  it('carries a Friday T+1 over the weekend', () => {
    expect(settlementDate(cal, 20260313, 1)).toBe(20260316);
  });

  it('steps over a holiday, so a pre-Thanksgiving trade settles on Friday', () => {
    expect(settlementDate(cal, 20261125, 1)).toBe(20261127);
  });

  it('handles the T+3 CDS upfront convention', () => {
    // Tue 24 Nov 2026 +3 sessions: Wed 25, then Thanksgiving is skipped,
    // Fri 27, then the weekend, landing on Mon 30 Nov.
    expect(settlementDate(cal, 20261124, 3)).toBe(20261130);
  });
});

describe('calendar choice changes the answer', () => {
  it('a holiday-free calendar settles a day earlier around Thanksgiving', () => {
    const naive = new WeekendOnlyCalendar();
    expect(settlementDate(naive, 20261125, 1)).toBe(20261126);
    expect(settlementDate(cal, 20261125, 1)).toBe(20261127);
  });
});
