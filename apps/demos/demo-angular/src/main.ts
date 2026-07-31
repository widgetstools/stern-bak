import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';

applyTheme(getTheme());

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
