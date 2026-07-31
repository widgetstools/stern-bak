import type { ReactElement } from 'react';

const CHECKLIST = [
  {
    title: '1. Verify AppData bootstrap',
    body: 'Switch to the AppData tab. You should see SessionContext and DeskDefaults populated after hub ready. Reload the page — with if-missing policy, hooks skip when providers already exist.',
  },
  {
    title: '2. Open Custom Settings',
    body: 'Toolbar settings (gear) opens the customizer on Grid Options by default. Use the module dropdown at the top to switch to Custom Settings. Scroll to EVENT CALLBACKS.',
  },
  {
    title: '3. Bind platform events',
    body: 'Enable log-profile-saved on Profile saved and log-profile-loaded on Profile loaded. Save a profile (toolbar Save) or switch profiles — watch the Events tab.',
  },
  {
    title: '4. Bind provider events',
    body: 'Enable log-provider-status and log-provider-switched. Change live provider or mode in Custom Settings — Events tab updates.',
  },
  {
    title: '5. Bind toolbar + grid events',
    body: 'Enable log-toolbar-date, then pick a past date in the toolbar date picker. Enable log-cell-clicked and click a cell. Enable log-filter-changed and apply a column filter.',
  },
  {
    title: '6. Confirm persistence',
    body: 'Event bindings persist in gridLevelData (grid-level, not per-profile). Reload the page — your dropdown selections should remain. Switch profiles — bindings stay.',
  },
  {
    title: '7. Hub inspector',
    body: 'Press Alt+Shift+S to inspect running providers, AppData mirror, and subscriber state.',
  },
];

export function DemoGuidePanel(): ReactElement {
  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
          What this demo shows
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-[color:var(--ds-text-secondary)]">
          <li>
            <strong className="text-[color:var(--ds-text-primary)]">AppData bootstrap</strong> — TS hook
            registry + <code className="font-mono">app-config.json</code> manifest; runs on main thread at hub
            ready.
          </li>
          <li>
            <strong className="text-[color:var(--ds-text-primary)]">Grid event callbacks</strong> — handler ids
            persisted in <code className="font-mono">gridLevelData.eventBindings</code>; resolved against app TS at
            runtime.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
          Hands-on checklist
        </h2>
        <ol className="mt-2 space-y-3">
          {CHECKLIST.map((step) => (
            <li
              key={step.title}
              className="rounded border border-[color:var(--ds-border-primary)] p-2"
            >
              <div className="text-xs font-medium">{step.title}</div>
              <p className="mt-1 text-[11px] text-[color:var(--ds-text-secondary)]">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded border border-dashed border-[color:var(--ds-border-primary)] p-2">
        <h2 className="text-xs font-semibold">Source map</h2>
        <dl className="mt-2 space-y-1 font-mono text-[10px] text-[color:var(--ds-text-secondary)]">
          <div>public/app-config.json → bootstrap manifest</div>
          <div>src/platform/appDataBootstrap.ts → hook implementations</div>
          <div>src/platform/gridEventHandlers.ts → event handlers</div>
          <div>src/platform/hooksMeta.ts → Custom Settings labels</div>
        </dl>
        <p className="mt-2 text-[10px] text-[color:var(--ds-text-muted)]">
          Full guide: docs/guides/platform-hooks-demo.md
        </p>
      </section>
    </div>
  );
}
