import type { APIRoute } from 'astro';
import { publishedTitleBySlug } from '../../../lib/article-metadata';
import { buildWantedPages } from '../../../../scripts/wanted-pages.js';

// Machine-readable Special:WantedPages report at /wiki/special/wantedpages.json:
// link targets that no published article satisfies (red links), ranked by how many
// distinct published articles request each one. Surfaces the highest-demand missing
// articles for editors — the one core MediaWiki special page this wiki lacked next
// to MostLinkedPages / AllPages / RecentChanges. The ranking is shared through
// scripts/wanted-pages.js (pure function) so the endpoint and the regression check
// derive from one source of truth, over the same public/data/linkgraph.json the
// other special pages read.
const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target: string }>> }
>;
const linkgraphData = Object.values(linkgraphModules)[0]?.default ?? {};

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const titleBySlug = publishedTitleBySlug();
  const wanted = buildWantedPages({ linkGraph: linkgraphData, titleBySlug });

  const body = JSON.stringify(
    {
      site: origin,
      wantedpagesJsonUrl: `${origin}/wiki/special/wantedpages.json`,
      count: wanted.length,
      pages: wanted.map((entry) => ({
        slug: entry.slug,
        // Distinct number of published articles that link to this missing page.
        count: entry.count,
        // The articles requesting it, each with its canonical URL so a consumer
        // can jump straight to the article that wants the missing page created.
        requestedBy: entry.requestedBy.map((from) => ({
          slug: from,
          title: titleBySlug[from],
          url: `${origin}/wiki/${from}/`,
        })),
      })),
    },
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
