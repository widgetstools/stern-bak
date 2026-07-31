import Handlebars from 'handlebars';

export function renderTemplate(templateSource: string, context: Record<string, unknown>): string {
  const compiled = Handlebars.compile(templateSource, { noEscape: true });
  return compiled(context);
}
