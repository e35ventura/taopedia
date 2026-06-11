import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const getPageSlug = (page: { id: string }) =>
  page.id.replace(/\/index\.(md|mdx)$/, '').replace(/\/index$/, '').replace(/\.(md|mdx)$/, '');

// MediaWiki's Special:PageInformation, as a per-article JSON endpoint. All
// inputs are build-time artifacts the site already produces: the newest-first
// revision history (scripts/generate-history.js) and the site-wide link graph +
// backlink index (scripts/build-linkgraph.js), read here the same way the
// article and sitemap routes read them. Only the revision AUTHOR NAME is
// surfaced — never the email, matching the privacy rule from #101.
const historyModules = import.meta.glob('../../../../public/history/**/*.json', { eager: true }) as Record<
  string,
  { default?: { history?: Array<{ authorName?: string; date?: string }> } }
>;
const linkGraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, unknown[]> }
>;
const backlinkModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, unknown[]> }
>;

const linkGraph = Object.values(linkGraphModules)[0]?.default ?? {};
const backlinks = Object.values(backlinkModules)[0]?.default ?? {};

const countWords = (text: string): number => (text.trim().match(/\S+/g) ?? []).length;

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  return pages.map((page) => ({ params: { slug: getPageSlug(page) }, props: { page } }));
}

export const GET: APIRoute = ({ params, props, site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const { page } = props as { page: { data: { title: string; categories?: string[] }; body?: string } };
  const slug = String(params.slug);

  const history = historyModules[`../../../../public/history/${slug}.json`]?.default?.history ?? [];
  const latest = history[0];
  const oldest = history[history.length - 1];

  const info = {
    title: page.data.title,
    url: `${origin}/wiki/${slug}/`,
    categories: page.data.categories ?? [],
    wordCount: countWords(page.body ?? ''),
    revisionCount: history.length,
    firstEdited: oldest?.date ?? null,
    lastEdited: latest?.date ?? null,
    lastEditor: latest?.authorName ?? null,
    outgoingLinks: Array.isArray(linkGraph[slug]) ? linkGraph[slug].length : 0,
    incomingLinks: Array.isArray(backlinks[slug]) ? backlinks[slug].length : 0,
  };

  return new Response(JSON.stringify(info, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
