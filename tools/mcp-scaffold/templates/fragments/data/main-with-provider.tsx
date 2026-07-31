import React from 'react';
import { createRoot } from 'react-dom/client';
import { DataServicesProvider } from '@wellsfargo-starui/host-data-react';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import { dataServices } from './dataServices';
import { App } from './App';
import './globals.css';

applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DataServicesProvider services={dataServices}>
      <App />
    </DataServicesProvider>
  </React.StrictMode>,
);
