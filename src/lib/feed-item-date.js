// Shared known-date resolution for syndication feed items. Atom, RSS, and JSON
// Feed builders all need the same fallback chain (modified -> legacy date ->
// published) and must treat empty strings as missing so published-only items
// still sort and emit dates.

export function itemDate(item) {
  if (!item) return '';
  const candidates = [item.dateModified, item.date, item.datePublished];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return '';
}

export function toRfc3339(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
