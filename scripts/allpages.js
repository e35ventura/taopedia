// Build the machine-readable article directory served at
// /wiki/special/allpages.json. Kept as a pure function in scripts/ (like
// statistics.js, most-linked.js, recent-changes.js) so the Astro endpoint and
// the regression check share one source of truth without rendering the site.
//
// The HTML Special:AllPages page (src/pages/wiki/special/allpages.astro)
// renders the same article directory grouped by topic for human display; this
// builder exposes the directory as structured JSON for programmatic consumers
// (dashboards, monitoring, cross-referencing tools, LLM training corpora).
//
// Membership, ordering, and grouping match the HTML page exactly:
//   - one row per published article, in the same {title, summary, topics} shape
//     the HTML cards render;
//   - one group per priority topic (Wallets, Subnets, Mining, Staking,
//     Consensus, Tokenomics), in the SAME priority order the page renders, then
//     a final "Other topics" group with the remaining articles;
//   - within each group, sorted by compareTitles (numeric: true) so subnet_9
//     orders before subnet_10 — the SAME comparator the HTML page uses.
// `limit` caps the total row count across all groups (newest pages first is
// not meaningful here, so cap is applied to the title-sorted list) and is
// exposed on the response so consumers know whether the feed was truncated.

import { compareTitles } from '../src/lib/title-sort.js';

const PRIORITY_TOPICS = ['Wallets', 'Subnets', 'Mining', 'Staking', 'Consensus', 'Tokenomics'];

export function buildAllPages({ pages, getPageSlug, limit }) {
  const rows = (Array.isArray(pages) ? pages : [])
    .map((page) => {
      const slug = getPageSlug(page);
      const title = page?.data?.title ?? '';
      const summary = page?.data?.summary ?? '';
      const topics = Array.isArray(page?.data?.categories) ? page.data.categories : [];
      return { slug, title, summary, topics };
    })
    .filter((row) => row.title);

  // Sort the full set deterministically by compareTitles (numeric: true), the
  // same comparator the HTML page uses inside each topic group and on the
  // overall page. So the JSON rows and the rendered cards agree on order.
  const sortedRows = [...rows].sort((a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));

  // Group in the SAME priority order the HTML page renders. An article whose
  // categories include multiple priority topics appears in every matching
  // priority group (the HTML page accumulates every page into every bucket
  // the page belongs to), and articles with NO priority topic land in the
  // "Other topics" catch-all. Groups with no members are dropped so the JSON
  // doesn't carry empty placeholders.
  const prioritySet = new Set(PRIORITY_TOPICS);
  const groups = [];
  for (const topic of PRIORITY_TOPICS) {
    const members = sortedRows.filter((row) => row.topics.includes(topic));
    if (members.length > 0) {
      groups.push({
        topic,
        categoryHref: `/wiki/category/${topic.replace(/ /g, '_')}/`,
        pages: members,
      });
    }
  }
  const otherPages = sortedRows.filter((row) => !row.topics.some((topic) => prioritySet.has(topic)));
  if (otherPages.length > 0) {
    groups.push({ topic: 'Other topics', categoryHref: null, pages: otherPages });
  }

  // limit caps the total row count across all groups (counting duplicates
  // across priority buckets — that matches what the HTML page would render
  // if it were capped the same way). Apply proportionally.
  const cap = Number.isFinite(limit) && limit > 0 ? limit : Number.POSITIVE_INFINITY;
  const totalEmittedBeforeCap = groups.reduce((acc, group) => acc + group.pages.length, 0);
  let remaining = cap;
  const cappedGroups = [];
  for (const group of groups) {
    if (remaining <= 0) {
      cappedGroups.push({ topic: group.topic, categoryHref: group.categoryHref, pages: [] });
      continue;
    }
    const slice = group.pages.slice(0, remaining);
    remaining -= slice.length;
    cappedGroups.push({ topic: group.topic, categoryHref: group.categoryHref, pages: slice });
  }
  const emittedCount = cappedGroups.reduce((acc, group) => acc + group.pages.length, 0);
  const truncated = emittedCount < totalEmittedBeforeCap;

  return {
    groups: cappedGroups,
    count: emittedCount,
    totalArticles: sortedRows.length,
    truncated,
  };
}

export const __test_priority_topics__ = PRIORITY_TOPICS;
