import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { buildArticleReferences } from '../../../../scripts/article-references.js';

// Machine-readable companion to /wiki/<slug>/references/. Lists which other
// articles this article links to (the OUTBOUND counterpart of backlinks.json,
// which lists which other articles link here). Mirrors the inline outbound
// wiki links the HTML article body renders, so programmatic consumers
// (citation tools, link rotators, knowledge-graph builders, cross-referencing
// tools) can read the outbound index as JSON without re-parsing the article
// HTML.
//
// The outbound set is read from the existing public/data/linkgraph.json (built
// by scripts/build-linkgraph.js, the same source backlinks.json.ts reads for
// the inbound index), so no new pipeline is introduced. Self-references and
// outbound links that do not resolve to a published article are excluded — the
// same published-only join backlinks.json.ts uses — and the title/slug tiebreak
// uses the same compareTitles helper so the two surfaces never disagree on
// ordering.

const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target: string; text: string }>> }
>;
const linkgraph = Object.values(linkgraphModules)[0]?.default ?? {};

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  return pages.map((page) => {
    const slug = getPageSlug(page);
    return { params: { slug }, props: { page, slug } };
  });
}

export const GET: APIRoute = async ({ props, site }) => {
  const { page, slug } = props as { page: { data: { title: string } }; slug: string };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const pages = await getCollection('pages');
  const titleBySlug: Record<string, string> = {};
  for (const p of pages) titleBySlug[getPageSlug(p)] = p.data.title;

  const links = (linkgraph[slug] ?? []).map((entry) => ({ slug: entry.target, text: entry.text }));

  const body = JSON.stringify(
    buildArticleReferences({ slug, title: page.data.title, origin, links, titleBySlug }),
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};