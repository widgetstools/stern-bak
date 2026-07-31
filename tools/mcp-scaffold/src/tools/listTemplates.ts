import { listTemplates } from '../lib/templateCatalog.js';

export function handleListTemplates() {
  return { templates: listTemplates() };
}
