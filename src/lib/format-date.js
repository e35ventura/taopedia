// Revision timestamps are formatted at build time. Without a pinned timeZone,
// toLocaleString uses the build machine's local zone, so the same commit
// renders a different wall-clock time on a contributor's local preview than on
// the UTC production build, and the displayed time carries no zone label. Pin
// to UTC and label it, matching the convention for wiki revision histories.
export function formatRevisionDate(dateString) {
  // A missing or unparseable timestamp would otherwise render the literal string
  // "Invalid Date" into the visible <time> element (and, upstream, into its
  // datetime attribute). Degrade to an empty string instead, matching how the rest
  // of the site's build-time date rendering drops date-bearing output for an
  // invalid/missing value (citations.js dateParts() returns null; the syndication
  // feed date helpers omit the field) rather than printing a broken date.
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}
