import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { buildContributors, buildContributorsDocument } from '../../../../scripts/contributors.js';

type RawRevision = { authorName?: string; date?: string };

// Every generated per-article history file (public/history/<slug>.json), the
// same source the Special:RecentChanges page and the sitemap <lastmod> read.
const historyModules = import.meta.glob('../../../../public/history/**/*.json', { eager: true }) as Record<
  string,
  { default?: { history?: RawRevision[] } }
>;
const HISTORY_PREFIX = '../../../../public/history/';

// Machine-readable contributor roster at /wiki/special/contributors.json.
// Mirrors the HTML Special:Contributors page as structured JSON for programmatic
// consumers (attribution tooling, dashboards, provenance/credibility checks),
// sharing scripts/contributors.js with the page and the regression check so the
// aggregation and ranking are identical across all three.
export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  const titleBySlug: Record<string, string> = {};
  for (const page of pages) titleBySlug[getPageSlug(page)] = page.data.title;

  const historyBySlug: Record<string, RawRevision[]> = {};
  for (const [key, mod] of Object.entries(historyModules)) {
    if (!key.startsWith(HISTORY_PREFIX) || !key.endsWith('.json')) continue;
    const slug = key.slice(HISTORY_PREFIX.length, -'.json'.length);
    historyBySlug[slug] = mod?.default?.history ?? [];
  }

  const contributors = buildContributors({ historyBySlug, titleBySlug });
  const body = JSON.stringify(buildContributorsDocument({ origin, contributors }), null, 2);

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
