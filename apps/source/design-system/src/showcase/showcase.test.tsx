import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOneByTestId, getOneByText } from '../../../../test-utils/queries';
import { SHOWCASE_ENTRIES, entriesByCategory } from './registry';
import { SHOWCASE_CATEGORIES } from './types';
import { PALETTE_GROUPS } from './palette';
import { ComponentDemo } from './ComponentDemo';
import { OverviewSection } from './sections/OverviewSection';
import { PaletteSection } from './sections/PaletteSection';
import { TypographySection } from './sections/TypographySection';
import { FoundationsSection } from './sections/FoundationsSection';
import { buttonsEntries } from './components/buttons';
import { inputsEntries } from './components/inputs';
import { selectionEntries } from './components/selection';
import { overlaysEntries } from './components/overlays';
import { navigationEntries } from './components/navigation';
import { dataDisplayEntries } from './components/dataDisplay';
import { feedbackEntries } from './components/feedback';
import { layoutEntries } from './components/layout';
import { chartsEntries } from './components/charts';

const allEntries = [
  ...buttonsEntries,
  ...inputsEntries,
  ...selectionEntries,
  ...overlaysEntries,
  ...navigationEntries,
  ...dataDisplayEntries,
  ...feedbackEntries,
  ...layoutEntries,
  ...chartsEntries,
];

describe('showcase registry', () => {
  it('aggregates entries and groups by category', () => {
    expect(SHOWCASE_ENTRIES.length).toBeGreaterThan(20);
    const grouped = entriesByCategory();
    for (const cat of SHOWCASE_CATEGORIES) {
      expect(grouped[cat.id]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('palette groups define token swatches', () => {
    expect(PALETTE_GROUPS.length).toBeGreaterThan(5);
    expect(PALETTE_GROUPS[0].swatches[0].varName).toMatch(/^--ds-/);
  });
});

describe('showcase sections', () => {
  it('renders foundation sections', () => {
    render(<OverviewSection />);
    expect(screen.getByTestId('ds-overview')).toBeInTheDocument();
    render(<PaletteSection />);
    expect(screen.getByTestId('ds-palette')).toBeInTheDocument();
    render(<TypographySection />);
    expect(screen.getByTestId('ds-typography')).toBeInTheDocument();
    render(<FoundationsSection />);
    expect(screen.getByTestId('ds-foundations')).toBeInTheDocument();
  });
});

describe('showcase component entries', () => {
  it('each entry module exports at least one demo', () => {
    expect(allEntries.length).toBe(SHOWCASE_ENTRIES.length);
  });

  it.each(SHOWCASE_ENTRIES.slice(0, 5))('renders ComponentDemo for $id', (entry) => {
    render(<ComponentDemo entry={entry} />);
    expect(screen.getByTestId(`ds-demo-${entry.id}`)).toBeInTheDocument();
  });

  it('switches to code tab in ComponentDemo', async () => {
    render(<ComponentDemo entry={buttonsEntries[0]} />);
    await userEvent.click(getOneByTestId('tab-trigger-code'));
    expect(getOneByText(buttonsEntries[0].importLine)).toBeInTheDocument();
  });
});

describe('showcase entry demos render', () => {
  it.each(allEntries)('$id demo renders preview', (entry) => {
    const Demo = entry.Demo;
    render(<Demo />);
  });
});
