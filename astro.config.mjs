import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkWikiLink from 'remark-wiki-link';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRemarkWikiLinkOptions, loadSlugMapFromContent } from './scripts/wiki-link-resolver.js';
import rehypeExternalLinks from './scripts/rehype-external-links.js';
import rehypeDropRedundantH1 from './scripts/rehype-drop-redundant-h1.js';
import rehypeHeadingAnchors from './scripts/rehype-heading-anchors.js';
// Astro injects heading ids in a step that runs AFTER user rehype plugins, so to
// give rehypeHeadingAnchors real ids to link to we run Astro's own heading-id
// plugin first (imported from Astro's bundled @astrojs/markdown-remark, so the
// ids match the ones the table of contents uses). Astro de-dupes it, not adding
// a second copy.
import { rehypeHeadingIds } from '@astrojs/markdown-remark';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.join(projectRoot, 'src', 'content', 'pages');
const wikiLinkOptions = createRemarkWikiLinkOptions(loadSlugMapFromContent(contentDir));

// https://astro.build/config
export default defineConfig({
  site: 'https://taopedia.org',
  integrations: [
    mdx({
      remarkPlugins: [
        [
          remarkWikiLink,
          wikiLinkOptions,
        ],
      ],
      rehypePlugins: [rehypeExternalLinks, rehypeDropRedundantH1, rehypeHeadingIds, rehypeHeadingAnchors],
    }),
  ],
  markdown: {
    remarkPlugins: [
      [
        remarkWikiLink,
        wikiLinkOptions,
      ],
    ],
    rehypePlugins: [rehypeExternalLinks, rehypeDropRedundantH1, rehypeHeadingIds, rehypeHeadingAnchors],
    shikiConfig: {
      theme: 'github-light',
    },
  },
});
