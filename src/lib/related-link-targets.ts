export function splitPlainTextRelatedTargets(value: string): string[] {
  const text = String(value ?? '').trim();
  if (!text) return [];

  const parts = text
    .split(/\s*(?:,|\/|;|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  return [...new Set(parts)];
}

function slugKey(value: string): string {
  return String(value || '').toLowerCase().replace(/ /g, '_').replace(/[^\w-]/g, '');
}

function splitCamelCase(value: string): string {
  return String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function singularizeWords(value: string): string {
  return String(value || '').replace(/\b([A-Za-z0-9]+)s\b/g, '$1');
}

export function relatedAliasKeys(value: string): string[] {
  const text = String(value ?? '').trim();
  if (!text) return [];

  return [...new Set([
    slugKey(text),
    slugKey(splitCamelCase(text)),
    slugKey(singularizeWords(text)),
    slugKey(singularizeWords(splitCamelCase(text))),
  ].filter(Boolean))];
}
