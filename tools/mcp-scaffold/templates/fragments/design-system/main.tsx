/**
 * App entry — applies persisted design-system theme before React mounts.
 * AG Grid theme follows [data-theme] via MarketsGrid useGridTheme() →
 * @wellsfargo-starui/design-system/adapters/ag-grid (agGridDarkTheme / agGridLightTheme).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import { App } from './App';
import './globals.css';

applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
