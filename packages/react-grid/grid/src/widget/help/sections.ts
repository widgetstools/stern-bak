/**
 * Section registry — id + display title + body component. The shell
 * in HelpPanel.tsx maps over this for the rail and looks up the
 * active section's `Body` to render the content pane.
 *
 * Adding a section: add a SectionId in ./types.ts, append meta in
 * ./sectionMeta.ts, drop the component into ./<NewSection>.tsx,
 * then wire it up here.
 */

import type { ComponentType } from 'react';
import { EmojiSection } from './EmojiSection';
import { ExcelSection } from './ExcelSection';
import { ExpressionsSection } from './ExpressionsSection';
import { Overview } from './Overview';
import { SECTION_META } from './sectionMeta';
import { TradingSection } from './TradingSection';
import { TrafficLightSection } from './TrafficLightSection';
import type { HelpSection, HelpSectionProps, SectionId } from './types';

const BODY_BY_ID: Record<SectionId, ComponentType<HelpSectionProps>> = {
  overview: Overview,
  excel: ExcelSection,
  trading: TradingSection,
  expressions: ExpressionsSection,
  'traffic-light': TrafficLightSection,
  emojis: EmojiSection,
};

export const SECTIONS: ReadonlyArray<HelpSection> = SECTION_META.map((meta) => ({
  id: meta.id,
  title: meta.title,
  Body: BODY_BY_ID[meta.id],
}));
