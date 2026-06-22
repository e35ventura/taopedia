import { compareTitles } from '../src/lib/title-sort.js';

// Aggregate every article's build-time revision history into a by-author
// contributor roster (the wiki's Special:Contributors / Special:ListUsers
// surface). Pure + unit-tested; shared by the HTML page, the JSON endpoint, and
// the regression check so all three derive from one source of truth.
//
// Only `authorName` is read — the exact field the per-article history page and
// Special:RecentChanges already render publicly. Emails are never touched (data
// minimization, enforced by check-history-privacy). The roster also backs the
// CC BY-SA 4.0 attribution the site footer commits to.

// Pure: fold per-slug histories into one ranked roster. A contributor's `edits`
// counts every revision they authored; `articles` is the number of distinct
// published articles they touched; `firstEdit`/`lastEdit` span their activity.
// Orphaned history (a slug with no published title) is skipped, matching the
// same join Special:RecentChanges uses. Entries missing an author or date are
// ignored. Ranked by edits desc, then distinct articles desc, then name, so the
// order is deterministic regardless of history-file traversal order.
export const buildContributors = ({ historyBySlug = {}, titleBySlug = {} }) => {
  const byAuthor = new Map();

  for (const [slug, history] of Object.entries(historyBySlug)) {
    if (!titleBySlug[slug]) continue;
    for (const entry of Array.isArray(history) ? history : []) {
      const name = typeof entry?.authorName === 'string' ? entry.authorName.trim() : '';
      const date = typeof entry?.date === 'string' ? entry.date : '';
      if (!name || !date) continue;

      let record = byAuthor.get(name);
      if (!record) {
        record = { name, edits: 0, articles: new Set(), firstEdit: date, lastEdit: date };
        byAuthor.set(name, record);
      }
      record.edits += 1;
      record.articles.add(slug);
      if (date < record.firstEdit) record.firstEdit = date;
      if (date > record.lastEdit) record.lastEdit = date;
    }
  }

  return [...byAuthor.values()]
    .map((record) => ({
      name: record.name,
      edits: record.edits,
      articles: record.articles.size,
      firstEdit: record.firstEdit,
      lastEdit: record.lastEdit,
    }))
    .sort(
      (a, b) =>
        b.edits - a.edits ||
        b.articles - a.articles ||
        compareTitles(a.name, b.name),
    );
};

// Wrap the ranked roster in the machine-readable document the JSON endpoint
// serves, mirroring the site/url/count envelope of the other Special:* JSON
// endpoints (subnets.json, allpages.json).
export const buildContributorsDocument = ({ origin, contributors = [] }) => ({
  site: origin,
  url: `${origin}/wiki/special/contributors.json`,
  count: contributors.length,
  totalEdits: contributors.reduce((sum, contributor) => sum + contributor.edits, 0),
  contributors: contributors.map((contributor) => ({
    name: contributor.name,
    edits: contributor.edits,
    articles: contributor.articles,
    firstEdit: contributor.firstEdit,
    lastEdit: contributor.lastEdit,
  })),
});
