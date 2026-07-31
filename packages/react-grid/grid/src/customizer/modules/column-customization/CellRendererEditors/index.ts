/**
 * CellRendererEditors barrel — one editor per configurable
 * renderer id, plus a lookup map the band uses to dispatch on
 * `cellRendererId`.
 */
import type { ComponentType } from 'react';
import type { CellRendererId } from '@wellsfargo-starui/design-system';
import { PillEditor } from './PillEditor';
import { HeatmapEditor } from './HeatmapEditor';
import { PercentBarEditor } from './PercentBarEditor';
import { TrendArrowEditor } from './TrendArrowEditor';
import { SparklineEditor } from './SparklineEditor';
import { MultiLineEditor } from './MultiLineEditor';
import { IconTextEditor } from './IconTextEditor';
import { CountryFlagEditor } from './CountryFlagEditor';
import { RatingDeltaEditor } from './RatingDeltaEditor';
import { TimeSinceEditor } from './TimeSinceEditor';
import { AllocationBarEditor } from './AllocationBarEditor';

export {
  PillEditor,
  HeatmapEditor,
  PercentBarEditor,
  TrendArrowEditor,
  SparklineEditor,
  MultiLineEditor,
  IconTextEditor,
  CountryFlagEditor,
  RatingDeltaEditor,
  TimeSinceEditor,
  AllocationBarEditor,
};

export interface CellRendererEditorProps<TConfig> {
  value: TConfig | undefined;
  onChange: (next: TConfig) => void;
  testId?: string;
}

/**
 * Map of configurable renderer id → editor component. Looked up
 * by `CellRendererBand` when rendering the per-renderer config
 * editor. The band passes the matching slice of
 * `cellRendererConfig.config` through unchanged.
 */
export const EDITORS_BY_ID: Partial<
  Record<CellRendererId, ComponentType<CellRendererEditorProps<never>>>
> = {
  pill: PillEditor as ComponentType<CellRendererEditorProps<never>>,
  heatmap: HeatmapEditor as ComponentType<CellRendererEditorProps<never>>,
  'percent-bar': PercentBarEditor as ComponentType<CellRendererEditorProps<never>>,
  'trend-arrow': TrendArrowEditor as ComponentType<CellRendererEditorProps<never>>,
  sparkline: SparklineEditor as ComponentType<CellRendererEditorProps<never>>,
  'multi-line': MultiLineEditor as ComponentType<CellRendererEditorProps<never>>,
  'icon-text': IconTextEditor as ComponentType<CellRendererEditorProps<never>>,
  'country-flag': CountryFlagEditor as ComponentType<CellRendererEditorProps<never>>,
  'rating-delta': RatingDeltaEditor as ComponentType<CellRendererEditorProps<never>>,
  'time-since': TimeSinceEditor as ComponentType<CellRendererEditorProps<never>>,
  'allocation-bar': AllocationBarEditor as ComponentType<CellRendererEditorProps<never>>,
};
