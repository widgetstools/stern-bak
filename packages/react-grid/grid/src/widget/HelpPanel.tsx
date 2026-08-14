/**
 * HelpPanel — an in-app cheatsheet for Excel format strings, expression
 * syntax, and trading-specific recipes. Rendered inside the SettingsSheet
 * body when the user clicks the Help icon in the sheet's title bar.
 *
 * The Expression Syntax section mirrors `docs/EXPRESSION_DSL.md` — the
 * authoritative engine reference (grammar, the full function catalog, and
 * JS→DSL conversion). Keep the two in lockstep when editing. Excel format
 * strings follow standard SSF (SheetJS) syntax.
 *
 * The shell holds the section rail and content pane. Section bodies and
 * shared presentational primitives live under ./help/ — see
 * `help/sections.ts` for the registry and `help/types.ts` for the shape
 * each section component must satisfy.
 */

import { useState } from 'react';
import { ChromeButton } from '../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import './HelpPanel.css';
import { SECTIONS } from './help/sections';
import type { SectionId } from './help/types';

export function HelpPanel() {
  const [active, setActive] = useState<SectionId>('overview');
  const activeSection = SECTIONS.find((s) => s.id === active);
  return (
    <div data-testid="v2-settings-help" className="ds-help-shell">
      {/* Section rail */}
      <nav className="ds-help-nav">
        <div className="ds-help-nav-eyebrow">Cookbook</div>
        {SECTIONS.map((s) => (
          <ChromeButton
            key={s.id}
            type="button"
            onClick={() => setActive(s.id)}
            data-testid={`help-nav-${s.id}`}
            data-active={s.id === active ? 'true' : 'false'}
            className="ds-help-nav-btn !justify-start"
          >
            {s.title}
          </ChromeButton>
        ))}
        <div className="ds-help-nav-footer">
          Expression reference
          <br />
          <code>docs/EXPRESSION_DSL.md</code>
        </div>
      </nav>

      {/* Content column */}
      <section
        data-testid="help-content"
        className="ds-help-content text-[12.5px] leading-relaxed"
      >
        <div className="ds-help-content-inner">
          {activeSection ? <activeSection.Body navigateTo={setActive} /> : null}
        </div>
      </section>
    </div>
  );
}
