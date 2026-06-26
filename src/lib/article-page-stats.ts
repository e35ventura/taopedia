import { render } from 'astro:content';
import { historyForSlug } from './article-history';
import { getArticleToc } from './article-toc.js';
import type { ContentPage } from './content-pages-by-slug';

export interface PageStatsBySlug {
  wordCountBySlug: Record<string, number>;
  sectionCountBySlug: Record<string, number>;
  historyBySlug: Record<string, ReturnType<typeof historyForSlug>>;
}

// Gather each slug's body word count, table-of-contents section count, and revision
// history in a single parallel pass over the resolved pages. The wordCount and history
// reads are folded into the render pass (rendering is what requires a resolved page),
// kept parallel via Promise.all so the render step is not serialized. Slugs without a
// resolved page are skipped. Shared by the listing / per-article JSON endpoints that
// each inlined this identical render pass.
export async function gatherPageStatsBySlug(
  slugs: Iterable<string>,
  pageBySlug: Record<string, ContentPage>,
): Promise<PageStatsBySlug> {
  const wordCountBySlug: Record<string, number> = {};
  const sectionCountBySlug: Record<string, number> = {};
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  await Promise.all(
    [...slugs].map(async (slug) => {
      const page = pageBySlug[slug];
      if (!page) return;
      wordCountBySlug[slug] = (page.body ?? '').trim().split(/\s+/).filter(Boolean).length;
      historyBySlug[slug] = historyForSlug(slug);
      const { headings } = await render(page);
      sectionCountBySlug[slug] = getArticleToc(headings).length;
    }),
  );
  return { wordCountBySlug, sectionCountBySlug, historyBySlug };
}
