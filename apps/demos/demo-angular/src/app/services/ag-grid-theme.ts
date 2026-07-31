import { themeQuartz } from 'ag-grid-community';
import { agGridLightParams, agGridDarkParams } from '@wellsfargo-starui/design-system/adapters/ag-grid';

export const fiGridTheme = themeQuartz
  .withParams(agGridLightParams as any, 'light')
  .withParams(agGridDarkParams as any, 'dark');
