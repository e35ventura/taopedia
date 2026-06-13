import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkWikiLink from 'remark-wiki-link';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRemarkWikiLinkOptions, loadSlugMapFromContent } from './scripts/wiki-link-resolver.js';
import rehypeExternalLinks from './scripts/rehype-external-links.js';
import rehypeDropRedundantH1 from './scripts/rehype-drop-redundant-h1.js';

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
      rehypePlugins: [rehypeExternalLinks, rehypeDropRedundantH1],
    }),
  ],
  markdown: {
    remarkPlugins: [
      [
        remarkWikiLink,
        wikiLinkOptions,
      ],
    ],
    rehypePlugins: [rehypeExternalLinks, rehypeDropRedundantH1],
    shikiConfig: {
      theme: 'github-light',
    },
  },
});
