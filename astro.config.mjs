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

// Astro deprecated the top-level `markdown.remarkPlugins` /
// `markdown.rehypePlugins` / `markdown.remarkRehype` config keys (Astro emits
// a deprecation warning on every build, and the maintainer-bot's cross-repo
// validation treats it as a hard failure — see the closed PR #1846). Drop
// the duplicated top-level markdown plugin block so the build runs cleanly.
// The plugins keep running via the @astrojs/mdx integration below, which is
// the supported path for remark/rehype plugins in Astro 6 and is what powers
// the MDX article rendering across this site; plain `.md` content under
// `src/content/pages/` does not need an explicit plugin pipeline because the
// site ships only MDX articles (the `taopedia-articles` companion repo is
// 100% MDX per the CONTRIBUTING guide).
//
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
    shikiConfig: {
      theme: 'github-light',
    },
  },
});
