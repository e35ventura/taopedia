import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkWikiLink from 'remark-wiki-link';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRemarkWikiLinkOptions, loadSlugMapFromContent } from './scripts/wiki-link-resolver.js';

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
    }),
  ],
  markdown: {
    remarkPlugins: [
      [
        remarkWikiLink,
        wikiLinkOptions,
      ],
    ],
    shikiConfig: {
      theme: 'github-light',
    },
  },
});
