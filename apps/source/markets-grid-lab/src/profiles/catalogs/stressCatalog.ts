import type { LabDemoProfileEntry } from '../labProfileKit';
import { FAST_FLASH } from '../../seeds';

export const STRESS_GRID_ID = 'lab-stress-v1';

/**
 * Deliberately thin. Every other catalog ships lenses that show off a module;
 * this tab is measuring the row engine, and a profile that repaints half the
 * cells on every tick would be measuring the profile instead.
 *
 * The one flashing lens is here because it IS the interesting case at scale:
 * conditional styling re-evaluates per visible cell per tick, and the two
 * engines differ in how many cells that is.
 */
export const STRESS_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'stress-00-plain',
    name: '00 · Plain',
    blurb: 'No styling, no rules — the engine and nothing else.',
    seed: {},
  },
  {
    id: 'stress-01-flash',
    name: '01 · Tick flash',
    blurb: 'Native cell flash on every change — repaint cost at depth.',
    seed: { 'general-settings': FAST_FLASH },
  },
];

export const STRESS_ACTIVE_PROFILE_ID = 'stress-00-plain';
