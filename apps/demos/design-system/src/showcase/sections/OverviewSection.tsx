import { CodeBlock } from '../../components/CodeBlock';

const CSS_IMPORT = `/* globals.css */
@import '@wellsfargo-starui/design-system/css';   /* tokens + base + scrollbar */

@tailwind base;
@tailwind components;
@tailwind utilities;`;

const APPLY_THEME = `// main.tsx — set the theme before first paint (no FOUC)
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';

applyTheme(getTheme());            // reads starui:theme, sets <html data-theme>
// toggle at runtime:  applyTheme({ theme: 'light' });`;

const TAILWIND = `// tailwind.config.js — consume the shared preset
import { tailwindPreset } from '@wellsfargo-starui/design-system/tailwind';

export default { presets: [tailwindPreset], content: ['./src/**/*.{ts,tsx}'] };`;

const AG_GRID = `// AG Grid picks up tokens via the prebuilt theme
import { AgGridReact } from 'ag-grid-react';
import { staruiGridTheme } from '@wellsfargo-starui/design-system/adapters/ag-grid';

<div data-ag-theme-mode={mode}>   {/* 'dark' | 'light' */}
  <AgGridReact theme={staruiGridTheme} rowData={rows} columnDefs={cols} />
</div>`;

export function OverviewSection() {
  return (
    <div className="flex max-w-[80ch] flex-col gap-5" data-testid="ds-overview">
      <header className="flex flex-col gap-1">
        <h2 className="text-[18px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">
          StarUI Design System
        </h2>
        <p className="text-[13px] text-[color:var(--ds-text-secondary)]">
          One token set styles shadcn components and AG Grid across light and dark. This terminal
          consumes <code className="font-[var(--ds-font-mono)]">@wellsfargo-starui/design-system</code> +{' '}
          <code className="font-[var(--ds-font-mono)]">@wellsfargo-starui/ui</code> — no bespoke styling.
        </p>
      </header>

      <div className="flex flex-col gap-1">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">1 · Import the tokens</h3>
        <CodeBlock code={CSS_IMPORT} label="globals.css" />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">2 · Apply a theme</h3>
        <CodeBlock code={APPLY_THEME} label="main.tsx" />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">3 · Tailwind preset</h3>
        <CodeBlock code={TAILWIND} label="tailwind.config.js" />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">4 · Theme AG Grid</h3>
        <CodeBlock code={AG_GRID} label="grid" />
      </div>
    </div>
  );
}
