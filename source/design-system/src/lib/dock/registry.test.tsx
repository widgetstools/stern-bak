import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { WIDGETS, type WidgetId } from './registry';
import { DemoStateProvider } from '../../state/DemoStateProvider';
import { ResearchProvider } from '../../state/ResearchProvider';
import { ThemeModeProvider } from '../useThemeMode';

const widgetIds = Object.keys(WIDGETS) as WidgetId[];

function renderWidget(id: WidgetId) {
  const Widget = WIDGETS[id];
  return render(
    <ThemeModeProvider>
      <DemoStateProvider>
        <ResearchProvider>
          <Widget />
        </ResearchProvider>
      </DemoStateProvider>
    </ThemeModeProvider>,
  );
}

describe('dock registry', () => {
  it('registers all expected widget ids', () => {
    expect(widgetIds).toContain('blotter');
    expect(widgetIds).toContain('designSystem');
    expect(widgetIds.length).toBeGreaterThan(20);
  });

  it.each(widgetIds)('renders widget %s without crashing', (id) => {
    const { unmount } = renderWidget(id);
    unmount();
  });
});
