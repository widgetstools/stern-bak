/**
 * Profiles preset gallery — SSRM twin of the lab's ProfilesTab. Same
 * PRESETS, same cards; the per-preset grid mounts against the shared
 * mock-ssrm provider instead of a per-preset CSRM stream.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { MarketsGrid, type MarketsGridHandle } from '@wellsfargo-starui/grid';
import { Button } from '@wellsfargo-starui/react';
import { useSsrmDataProvider } from '@wellsfargo-starui/react/data/runtime';
import { TabContainer } from '../../../markets-grid-lab/src/components/TabContainer';
import { defaultColDef } from '../../../markets-grid-lab/src/data/columns';
import { useLabDemoProfiles } from '../../../markets-grid-lab/src/data/useLabDemoProfiles';
import { labStorage } from '../../../markets-grid-lab/src/data/storage';
import { HELP } from '../../../markets-grid-lab/src/help';
import { PRESETS } from '../../../markets-grid-lab/src/profiles/presets';
import type { ProfilePreset } from '../../../markets-grid-lab/src/profiles/types';
import { withSsrmSafeColumns } from '../ssrm/ssrmColumnDefs';
import { parityFor } from '../parity/parityNotes';
import { SsrmParityBadge } from '../parity/SsrmParityBadge';

const ACCENT_CLASS: Record<ProfilePreset['accent'], string> = {
  blue:   'before:bg-[color:var(--ds-primary)]',
  green:  'before:bg-[color:var(--ds-accent-positive)]',
  amber:  'before:bg-[color:var(--ds-accent-warning)]',
  purple: 'before:bg-[color:var(--ds-accent-info)]',
  pink:   'before:bg-[color:var(--ds-accent-negative)]',
  slate:  'before:bg-[color:var(--ds-text-secondary)]',
};

export function SsrmProfilesTab({ providerId }: { providerId: string }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useMemo(() => PRESETS.find((p) => p.id === activeId) ?? null, [activeId]);

  if (active) {
    return (
      <SsrmPresetGridView
        preset={active}
        providerId={providerId}
        onBack={() => setActiveId(null)}
      />
    );
  }
  return <SsrmPresetGallery onOpen={setActiveId} />;
}

function SsrmPresetGallery({ onOpen }: { onOpen: (id: string) => void }) {
  const parity = parityFor('profiles');
  return (
    <TabContainer
      title="Profiles · SSRM"
      subtitle="Pre-baked configurations · click any card to open the grid for that lens"
      help={HELP.profiles}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {parity ? <SsrmParityBadge entry={parity} /> : null}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              variant="outline"
              data-testid={`ssrm-preset-${p.id}`}
              onClick={() => onOpen(p.id)}
              className={`relative flex h-auto flex-col items-start gap-1 overflow-hidden rounded-lg border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] p-4 text-left before:absolute before:inset-y-0 before:left-0 before:w-1 ${ACCENT_CLASS[p.accent]}`}
            >
              <span className="text-[14px] font-semibold text-[color:var(--ds-text-primary)]">{p.name}</span>
              <span className="whitespace-normal text-[12px] leading-snug text-[color:var(--ds-text-secondary)]">
                {p.tagline}
              </span>
            </Button>
          ))}
        </div>
      </div>
    </TabContainer>
  );
}

function SsrmPresetGridView({
  preset,
  providerId,
  onBack,
}: {
  preset: ProfilePreset;
  providerId: string;
  onBack: () => void;
}) {
  const installDemoProfiles = useLabDemoProfiles(
    `${preset.id}-ssrm`,
    preset.demoProfiles ?? [],
    preset.activeDemoProfileId ?? '',
  );
  const onProfilesReady =
    preset.demoProfiles && preset.demoProfiles.length > 0 && preset.activeDemoProfileId
      ? (handle: MarketsGridHandle) => installDemoProfiles(handle)
      : undefined;
  const { provider } = useSsrmDataProvider(providerId, { autoStart: true });
  const columnDefs = useMemo(() => withSsrmSafeColumns(preset.buildColumns()), [preset]);
  const colDefBase = preset.defaultColDef ?? defaultColDef;
  const ssrm = useMemo(
    () => (provider ? { provider, keyColumn: 'id' as const, cacheBlockSize: 200 } : null),
    [provider],
  );

  return (
    <TabContainer
      title={`${preset.name} · SSRM`}
      subtitle={preset.tagline}
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
        {ssrm ? (
          <MarketsGrid
            key={preset.id}
            gridId={`${preset.id}-ssrm`}
            componentName={`${preset.name} (SSRM)`}
            rowData={[]}
            ssrm={ssrm}
            columnDefs={columnDefs}
            defaultColDef={colDefBase}
            rowIdField="id"
            rowHeight={preset.rowHeight}
            storage={labStorage}
            onReady={onProfilesReady}
            showFiltersToolbar={preset.toolbars?.showFiltersToolbar}
            showFormattingToolbar={preset.toolbars?.showFormattingToolbar}
            showEditingToolbar={preset.toolbars?.showEditingToolbar}
            showProfileSelector
            showSaveButton
            showSettingsButton
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-[color:var(--ds-text-secondary)]">
            Starting SSRM provider…
          </div>
        )}
      </div>
    </TabContainer>
  );
}
