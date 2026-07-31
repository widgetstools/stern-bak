import { X } from 'lucide-react';
import { Band, Caps } from '../../../ui/SettingsPanel';
import { ChromeButton } from '../../../ui/ChromeButton';
import { Row } from './Row';
import { TemplatePicker } from './TemplatePicker';
import type { ColumnTemplate } from '../../column-templates';

export function TemplatesBand({
  colId,
  templates,
  allTemplates,
  appliedIds,
  onAdd,
  onRemove,
}: {
  colId: string;
  templates: ColumnTemplate[];
  allTemplates: Record<string, ColumnTemplate>;
  appliedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Band index="03" title="TEMPLATES">
      {/* Applied-templates line item — mirrors the Row rhythm used by
          every other band so the user scans "APPLIED | <chips>" at a
          glance. Chips carry a per-row × to remove the template from
          the draft. */}
      <Row
        label="APPLIED"
        hint={
          templates.length > 0
            ? `${templates.length} template${templates.length === 1 ? '' : 's'} · later templates layer over earlier`
            : 'No style templates on this column yet'
        }
        control={
          templates.length === 0 ? (
            <Caps size="xs" color="var(--ds-text-faint)">
              —
            </Caps>
          ) : (
            <div
              data-testid={`cols-${colId}-templates`}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              {templates.map((t) => (
                <span
                  key={t.id}
                  data-testid={`cols-${colId}-template-${t.id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 4px 0 10px',
                    height: 24,
                    background: 'var(--ds-surface-tertiary)',
                    border: '1px solid var(--ds-border-secondary)',
                    borderRadius: 2,
                    fontSize: 11,
                    fontFamily: 'var(--ds-font-sans)',
                    color: 'var(--ds-text-primary)',
                  }}
                >
                  {t.name}
                  <ChromeButton
                    type="button"
                    aria-label={`Remove template ${t.name}`}
                    title={`Remove ${t.name}`}
                    onClick={() => onRemove(t.id)}
                    data-testid={`cols-${colId}-template-remove-${t.id}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 18,
                      height: 18,
                      padding: 0,
                      margin: 0,
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--ds-text-muted)',
                      cursor: 'pointer',
                      borderRadius: 2,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--ds-accent-negative)';
                      e.currentTarget.style.background = 'var(--ds-overlay-negative-soft)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--ds-text-muted)';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <X size={12} strokeWidth={2} />
                  </ChromeButton>
                </span>
              ))}
            </div>
          )
        }
      />
      <Row
        label="ADD TEMPLATE"
        hint="Pick a saved template to layer onto this column"
        control={
          <TemplatePicker
            allTemplates={allTemplates}
            appliedIds={appliedIds}
            onAdd={onAdd}
            colId={colId}
          />
        }
      />
    </Band>
  );
}
