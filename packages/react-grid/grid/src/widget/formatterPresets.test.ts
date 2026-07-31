import { describe, expect, it } from 'vitest';
import {
  BPS_TEMPLATE,
  COMMA_TEMPLATE,
  CURRENCY_FORMATTERS,
  PERCENT_TEMPLATE,
  isCommaTemplate,
  isPercentTemplate,
  isTickTemplate,
  numberTemplate,
  templateDecimals,
} from './formatterPresets';

describe('formatterPresets', () => {
  it('exposes currency presets for major codes', () => {
    expect(CURRENCY_FORMATTERS.USD.label).toBe('$');
    expect(CURRENCY_FORMATTERS.EUR.template.preset).toBe('currency');
    expect(CURRENCY_FORMATTERS.JPY.template.options).toEqual({ currency: 'JPY', decimals: 0 });
  });

  it('clamps numberTemplate decimals to 0–10', () => {
    expect(numberTemplate(-1).options).toEqual({ decimals: 0, thousands: true });
    expect(numberTemplate(99).options).toEqual({ decimals: 10, thousands: true });
    expect(numberTemplate(3).options).toEqual({ decimals: 3, thousands: true });
  });

  it('templateDecimals reads preset decimals and expression patterns', () => {
    expect(templateDecimals(undefined)).toBeNull();
    expect(templateDecimals(PERCENT_TEMPLATE)).toBe(2);
    expect(templateDecimals(COMMA_TEMPLATE)).toBe(0);
    expect(
      templateDecimals({
        kind: 'expression',
        expression: 'x.toFixed(4)',
      }),
    ).toBe(4);
    expect(
      templateDecimals({
        kind: 'expression',
        expression: 'new Intl.NumberFormat(undefined,{maximumFractionDigits:1})',
      }),
    ).toBe(1);
    expect(templateDecimals({ kind: 'tick', tickSize: 0.01 })).toBeNull();
  });

  it('classifies percent, comma, and tick templates', () => {
    expect(isPercentTemplate(PERCENT_TEMPLATE)).toBe(true);
    expect(isPercentTemplate(BPS_TEMPLATE)).toBe(false);
    expect(isCommaTemplate(COMMA_TEMPLATE)).toBe(true);
    expect(isCommaTemplate(numberTemplate(2))).toBe(false);
    expect(isTickTemplate({ kind: 'tick', tickSize: 0.125 })).toBe(true);
  });
});
