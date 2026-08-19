import React from 'react';
import { createRoot } from 'react-dom/client';
import { createStarui, applyTheme, getTheme } from '@wellsfargo-starui/grid';
import { App } from './App';
import './globals.css';

const starui = createStarui({
  appId: 'BasicBondBlotter',
  userId: 'demo',
});

applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <starui.Provider>
      <App />
    </starui.Provider>
  </React.StrictMode>,
);
