// Build the body of /llms.txt. Kept as a pure function in scripts/ (like
// robots.js and structured-data.js) so the Astro route and the regression check
// share one source of truth and can be unit tested without rendering the site.
//
// Format follows the llmstxt.org convention: a single H1 title, an optional
// blockquote summary, then one H2 section per category listing the canonical
// article links, and a trailing "## Optional" section pointing at secondary
// machine-readable resources (sitemap, search) that an agent may skip.
//
// URLs use the canonical trailing-slash article paths (matching the sitemap and
// the <link rel="canonical">), so an agent never follows a 301.

const SITE_NAME = 'Taopedia';
const SITE_SUMMARY =
  'A Bittensor-focused knowledge base for TAO, subnets, wallets, staking, mining, validation, and consensus.';
const UNCATEGORIZED = 'Other';

// Mirror the slug derivation used by sitemap.xml.ts / search-data.json.ts.
function getPageSlug(page) {
  return String(page?.id ?? '')
    .replace(/\/index\.(md|mdx)$/, '')
    .replace(/\/index$/, '')
    .replace(/\.(md|mdx)$/, '');
}

// Collapse whitespace and neutralize characters that would break a markdown
// link or start a new line/list item inside the single-line entry.
function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeLinkText(value) {
  return cleanText(value).replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

export function buildLlmsTxt({ origin, pages }) {
  const base = String(origin || '').replace(/\/$/, '');
  const list = Array.isArray(pages) ? pages : [];

  // One entry per (category, article) pair so an article appears under each of
  // its categories — matching how the site's category pages group content.
  const byCategory = new Map();
  for (const page of list) {
    if (page?.data?.draft) continue;

    const slug = getPageSlug(page);
    if (!slug) continue;

    const title = cleanText(page.data?.title) || slug;
    const summary = cleanText(page.data?.summary);
    const url = `${base}/wiki/${slug}/`;
    const entryLine = summary
      ? `- [${escapeLinkText(title)}](${url}): ${summary}`
      : `- [${escapeLinkText(title)}](${url})`;

    const categories = Array.isArray(page.data?.categories) && page.data.categories.length > 0
      ? page.data.categories
      : [UNCATEGORIZED];

    for (const category of categories) {
      const key = cleanText(category) || UNCATEGORIZED;
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push({ title, line: entryLine });
    }
  }

  const lines = [`# ${SITE_NAME}`, '', `> ${SITE_SUMMARY}`, ''];

  // Categories alphabetically, with the "Other" bucket always last; articles
  // within a category alphabetically by title. Deterministic for the check.
  const categoryNames = [...byCategory.keys()].sort((a, b) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b);
  });

  for (const category of categoryNames) {
    lines.push(`## ${category}`, '');
    const entries = byCategory.get(category).sort((a, b) => a.title.localeCompare(b.title));
    for (const entry of entries) lines.push(entry.line);
    lines.push('');
  }

  // "Optional" links are secondary resources an agent may skip. Only the
  // sitemap is listed; /search is intentionally omitted because robots.txt
  // disallows it (and an unparameterized /search/ carries no content).
  lines.push('## Optional', '');
  lines.push(`- [Sitemap](${base}/sitemap.xml): every canonical page URL`);
  lines.push('');

  return lines.join('\n');
}
