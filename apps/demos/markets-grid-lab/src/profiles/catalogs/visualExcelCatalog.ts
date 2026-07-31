import type { LabDemoProfileEntry } from '../labProfileKit';
import { FORMATTING_CC_STATE } from '../../seeds/columnCustomization';
import { CONDITIONAL_TAB_CS_RULES } from '../../seeds';

export const VISUAL_EXCEL_GRID_ID = 'lab-visual-excel-v1';

const pickRules = (...ids: string[]) =>
  CONDITIONAL_TAB_CS_RULES.filter((r) => ids.includes(r.id));

export const VISUAL_EXCEL_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'vx-00-full-showcase',
    name: '00 · Full showcase',
    blurb: 'Every formatter + P&L cell colours — spreadsheet icon exports WYSIWYG .xlsx.',
    seed: {
      'column-customization': FORMATTING_CC_STATE,
      'conditional-styling': {
        rules: pickRules('demo-cell-color', 'demo-cell-color-loser'),
      },
      'visual-excel': {
        settings: { enabled: true, fileNamePrefix: 'lab-visual-excel' },
      },
    },
  },
  {
    id: 'vx-01-formatters-only',
    name: '01 · Formatters only',
    blurb: 'Excel format strings without conditional background rules.',
    seed: {
      'column-customization': FORMATTING_CC_STATE,
      'visual-excel': {
        settings: { enabled: true, fileNamePrefix: 'lab-formatters' },
      },
    },
  },
  {
    id: 'vx-02-styles-only',
    name: '02 · Style rules only',
    blurb: 'Cell paint on P&L columns; bare number formats elsewhere.',
    seed: {
      'conditional-styling': {
        rules: pickRules('demo-cell-color', 'demo-cell-color-loser'),
      },
      'visual-excel': {
        settings: { enabled: true, fileNamePrefix: 'lab-styles' },
      },
    },
  },
  {
    id: 'vx-03-module-off',
    name: '03 · Module off',
    blurb: 'Visual Excel disabled — export falls back to plain AG Grid excel.',
    seed: {
      'column-customization': FORMATTING_CC_STATE,
      'conditional-styling': {
        rules: pickRules('demo-cell-color', 'demo-cell-color-loser'),
      },
      'visual-excel': {
        settings: { enabled: false, fileNamePrefix: 'plain-export' },
      },
    },
  },
];

export const VISUAL_EXCEL_ACTIVE_PROFILE_ID = 'vx-00-full-showcase';
