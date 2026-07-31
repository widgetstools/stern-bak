import { GRID_FEATURE_CATALOG, defaultGridFeatures } from '../resources/gridFeatureCatalog.js';
import { listTemplates } from '../lib/templateCatalog.js';

export function handleListGridFeatures(templateId?: string) {
  const templates = listTemplates();
  const defaults = templateId
    ? { [templateId]: defaultGridFeatures(templateId) }
    : Object.fromEntries(templates.map((t) => [t.id, defaultGridFeatures(t.id)]));

  return { catalog: GRID_FEATURE_CATALOG, defaultsByTemplate: defaults };
}
