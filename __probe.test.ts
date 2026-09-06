import { it } from 'vitest';
import { RuleEngine, AlertsEngine } from '@wellsfargo-starui/velocity-grid/rules';
import { CalcEngine } from '@wellsfargo-starui/velocity-grid/calc';
import { CONDITIONAL_RULES, ALERT_RULES } from '../src/lab/seeds';
it('probe', () => {
  console.log('RULES:', JSON.stringify(new RuleEngine({}).setRules(CONDITIONAL_RULES).errors, null, 1));
  console.log('ALERTS:', JSON.stringify(new AlertsEngine({}).setRules(ALERT_RULES).errors, null, 1));
  console.log('CALC METHODS:', Object.getOwnPropertyNames(CalcEngine.prototype).join(', '));
});
