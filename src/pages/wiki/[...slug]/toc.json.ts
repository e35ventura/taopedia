import type { APIRoute } from 'astro';
import { getCollection, render } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { buildArticleToc, getArticleToc } from '../../../lib/article-toc.js';

export async function getStaticPaths() {
  const pages = await getCollection('pages');

  return Promise.all(
    pages.map(async (page) => {
      const slug = getPageSlug(page);
      const { headings } = await render(page);

      return {
        params: { slug },
        props: {
          slug,
          title: page.data.title,
          summary: page.data.summary ?? '',
          categories: page.data.categories ?? [],
          sections: getArticleToc(headings),
        },
      };
    }),
  );
}

// Machine-readable companion to the rendered article contents sidebar. It uses
// the same shared TOC helper the article page consumes, so the visibility,
// numbering, and deep-link contract live in one runtime source of truth.
export const GET: APIRoute = async ({ props, site }) => {
  const { slug, title, summary, categories, sections } = props as {
    slug: string;
    title: string;
    summary: string;
    categories: string[];
    sections: Array<{ number: number; depth: number; slug: string; title: string }>;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(buildArticleToc({ slug, title, origin, summary, categories, sections }), null, 2);

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
