/**
 * v2 SettingsPanel primitives — Cockpit Terminal edition.
 *
 * Import site:
 *
 *   import {
 *     ObjectTitleRow, FigmaPanelSection, SubLabel, PairRow,
 *     IconInput, PillToggleGroup, PillToggleBtn, GhostIcon, LedBar,
 *     Caps, Mono, SharpBtn, TGroup, TBtn, TDivider, Band, MetaCell, Stepper,
 *   } from '@wellsfargo-starui/core';
 *
 * Every primitive consumes `--ds-*` tokens from the unified design system
 * via Tailwind utility classes from the shared preset.
 */

export { LedBar, type LedBarProps } from './LedBar';
export { GhostIcon, type GhostIconProps } from './GhostIcon';
export { SubLabel, type SubLabelProps } from './SubLabel';
export { IconInput, type IconInputProps } from './IconInput';
export { PillToggleGroup, PillToggleBtn, type PillToggleGroupProps, type PillToggleBtnProps } from './PillToggleGroup';
export { PairRow, type PairRowProps } from './PairRow';
export { FigmaPanelSection, type FigmaPanelSectionProps } from './FigmaPanelSection';
export { ObjectTitleRow, type ObjectTitleRowProps } from './ObjectTitleRow';
export { TitleInput, type TitleInputProps } from './TitleInput';
export { SettingsRow, type SettingsRowProps } from './SettingsRow';
export {
  SummaryChip,
  type SummaryChipProps,
  type SummaryChipTone,
} from './SummaryChip';
export {
  CockpitList,
  CockpitListItem,
  CockpitListItemMeta,
  type CockpitListProps,
  type CockpitListItemProps,
} from './CockpitList';
export {
  Caps,
  Mono,
  SharpBtn,
  TGroup,
  TBtn,
  TDivider,
  Band,
  MetaCell,
  Stepper,
  SETTINGS_SECTION_TITLE,
  type CapsProps,
  type MonoProps,
  type SharpBtnProps,
  type SharpBtnVariant,
  type TGroupProps,
  type TBtnProps,
  type BandProps,
  type MetaCellProps,
  type StepperProps,
} from './Cockpit';
