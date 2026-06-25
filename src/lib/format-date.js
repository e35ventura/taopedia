// Revision timestamps are formatted at build time. Without a pinned timeZone,
// toLocaleString uses the build machine's local zone, so the same commit
// renders a different wall-clock time on a contributor's local preview than on
// the UTC production build, and the displayed time carries no zone label. Pin
// to UTC and label it, matching the convention for wiki revision histories.
export function formatRevisionDate(dateString) {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

// Date-only labels for article footers, cite pages, and statistics summaries.
// Degrades to an empty string for a missing or unparseable timestamp instead of
// the literal "Invalid Date" raw Date(...).toLocaleDateString() would emit.
export function formatArticleDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
