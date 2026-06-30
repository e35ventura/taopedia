export function splitPlainTextRelatedTargets(value: string): string[] {
  const text = String(value ?? '').trim();
  if (!text) return [];

  const parts = text
    .split(/\s*(?:,|\/|;|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  return [...new Set(parts)];
}
