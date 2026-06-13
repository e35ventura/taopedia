// Build academic citation strings for a Taopedia article. Kept as a pure
// function in scripts/ (like structured-data.js and robots.js) so the Astro
// page and the regression check share one source of truth and can be unit
// tested without rendering the site.
//
// Taopedia articles are collaboratively maintained, so the cited author is the
// generic "Taopedia contributors" (mirroring MediaWiki's "Wikipedia
// contributors" convention). No individual git committer names are exposed,
// consistent with how the structured data and the served revision history keep
// contributor identities out of public output.

const AUTHOR = 'Taopedia contributors';
const PUBLISHER = 'Taopedia';

// Split an ISO 8601 date into UTC parts, or null for a missing/invalid date.
// UTC matches the rest of the site's build-time date rendering so a citation
// shows the same day regardless of the build machine's timezone.
function dateParts(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    year: d.getUTCFullYear(),
    day: d.getUTCDate(),
    month: d.toLocaleString('en-US', { timeZone: 'UTC', month: 'long' }),
  };
}

// Escape a free-text value for a brace-delimited BibTeX field. The regex scans
// the original string (replacement text is never re-scanned), so the braces in
// e.g. \textbackslash{} are not themselves re-escaped. Brace-delimited fields
// also make a literal " safe, so a title containing a quote or a backslash can
// no longer produce malformed BibTeX output.
function bibtexEscape(value) {
  return String(value).replace(/[\\{}&%$#_~^]/g, (ch) => {
    switch (ch) {
      case '\\':
        return '\\textbackslash{}';
      case '~':
        return '\\textasciitilde{}';
      case '^':
        return '\\textasciicircum{}';
      default:
        return `\\${ch}`; // { } & % $ # _
    }
  });
}

// APA / MLA / Chicago / BibTeX citations for one article. `date` is the article's
// last-revision date (ISO 8601), or '' / undefined when it has no recorded
// history — in which case date-bearing clauses degrade gracefully ("n.d." for
// APA, omitted elsewhere) rather than printing an invalid date.
export function buildCitations({ title, url, slug, date }) {
  const p = dateParts(date);
  const apaDate = p ? `${p.year}, ${p.month} ${p.day}` : 'n.d.';
  const mlaDate = p ? `${p.day} ${p.month} ${p.year}` : '';
  const longDate = p ? `${p.month} ${p.day}, ${p.year}` : '';
  const year = p ? String(p.year) : '';

  const apa = `${AUTHOR}. (${apaDate}). ${title}. ${PUBLISHER}. ${url}`;

  const mla = `"${title}." ${PUBLISHER}, ${mlaDate ? `${mlaDate}, ` : ''}${url}.`;

  const chicago =
    `${AUTHOR}. "${title}." ${PUBLISHER}.${longDate ? ` Last modified ${longDate}.` : ''} ${url}.`;

  // Brace-delimited fields; the title is escaped because it is free text. The
  // citation key is restricted to BibTeX-safe characters (slugs already are,
  // but this is defensive against a future slug shape).
  const citeKey = `taopedia:${slug}`.replace(/[^\w:-]/g, '_');
  const bibtex = [
    `@misc{${citeKey},`,
    `  author       = {${AUTHOR}},`,
    `  title        = {${bibtexEscape(title)} --- ${PUBLISHER}},`,
    ...(year ? [`  year         = {${year}},`] : []),
    `  howpublished = {\\url{${url}}},`,
    ...(longDate ? [`  note         = {[Online; last modified ${longDate}]}`] : []),
    `}`,
  ].join('\n');

  return { apa, mla, chicago, bibtex };
}

// Ordered list of the formats buildCitations returns, for rendering and tests.
export const CITATION_FORMATS = [
  { key: 'apa', label: 'APA' },
  { key: 'mla', label: 'MLA' },
  { key: 'chicago', label: 'Chicago' },
  { key: 'bibtex', label: 'BibTeX' },
];

export const CITATION_META = { author: AUTHOR, publisher: PUBLISHER };
