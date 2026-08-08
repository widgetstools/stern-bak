import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@wellsfargo-starui/react';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef } from '../data/columns';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { HELP } from '../help';
import { PRESETS } from '../profiles/presets';
import type { ProfilePreset } from '../profiles/types';
import { SsrmLabGrid } from '../ssrm/SsrmLabGrid';

const ACCENT_CLASS: Record<ProfilePreset['accent'], string> = {
  blue:   'before:bg-[color:var(--ds-primary)]',
  green:  'before:bg-[color:var(--ds-accent-positive)]',
  amber:  'before:bg-[color:var(--ds-accent-warning)]',
  purple: 'before:bg-[color:var(--ds-accent-info)]',
  pink:   'before:bg-[color:var(--ds-accent-negative)]',
  slate:  'before:bg-[color:var(--ds-text-secondary)]',
};

export function ProfilesTab() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useMemo(() => PRESETS.find((p) => p.id === activeId) ?? null, [activeId]);

  if (active) return <PresetGridView preset={active} onBack={() => setActiveId(null)} />;
  return <PresetGallery onOpen={setActiveId} />;
}

// ─── Gallery view ────────────────────────────────────────────────────

function PresetGallery({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <TabContainer
      title="Profiles"
      subtitle="Pre-baked configurations · click any card to open the grid for that lens"
      help={HELP.profiles}
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant="outline"
            onClick={() => onOpen(p.id)}
            className={`group relative flex h-full flex-col gap-3 rounded-lg border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)] p-4 text-left transition-colors hover:border-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-primary)] before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-l-lg ${ACCENT_CLASS[p.accent]}`}
          >
            <div className="flex items-baseline justify-between gap-2 pl-2">
              <h3 className="text-[14px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">
                {p.name}
              </h3>
              <span className="text-[10px] uppercase tracking-wider text-[color:var(--ds-text-secondary)]">
                preset
              </span>
            </div>
            <p className="pl-2 text-[12px] leading-relaxed text-[color:var(--ds-text-secondary)]">
              {p.tagline}
            </p>
            <div className="mt-auto flex items-center gap-2 pl-2 text-[11px] text-[color:var(--ds-text-secondary)] transition-colors group-hover:text-[color:var(--ds-text-primary)]">
              Open lens →
            </div>
          </Button>
        ))}
      </div>
    </TabContainer>
  );
}

// ─── Single-preset grid view ─────────────────────────────────────────

function PresetGridView({
  preset,
  onBack,
}: {
  preset: ProfilePreset;
  onBack: () => void;
}) {
  const installDemoProfiles = useLabDemoProfiles(
    preset.id,
    preset.demoProfiles ?? [],
    preset.activeDemoProfileId ?? '',
  );
  const onProfilesReady =
    preset.demoProfiles && preset.demoProfiles.length > 0 && preset.activeDemoProfileId
      ? installDemoProfiles
      : undefined;
  const columnDefs = useMemo(() => preset.buildColumns(), [preset]);
  const colDefBase = preset.defaultColDef ?? defaultColDef;

  return (
    <TabContainer
      title={preset.name}
      subtitle={`${preset.tagline} · SSRM`}
      help={preset.description}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="h-8 gap-1 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[12px]"
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          All presets
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <SsrmLabGrid
          key={preset.id}
          gridId={preset.id}
          componentName={preset.name}
          columnDefs={columnDefs}
          defaultColDef={colDefBase}
          rowHeight={preset.rowHeight}
          onReady={onProfilesReady}
          showFiltersToolbar={preset.toolbars?.showFiltersToolbar}
          showFormattingToolbar={preset.toolbars?.showFormattingToolbar}
          showEditingToolbar={preset.toolbars?.showEditingToolbar}
          showProfileSelector
          showSaveButton
          showSettingsButton
        />
      </div>
    </TabContainer>
  );
}

