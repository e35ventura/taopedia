import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import mdx from '@astrojs/mdx';
import remarkWikiLink from 'remark-wiki-link';

// https://astro.build/config
export default defineConfig({
  site: 'https://taopedia.org',
  adapter: netlify(),
  integrations: [
    mdx({
      remarkPlugins: [
        [
          remarkWikiLink,
          {
            pageResolver: (name) => [name.toLowerCase().replace(/ /g, '_')],
            hrefTemplate: (permalink) => `/wiki/${permalink}`,
          },
        ],
      ],
    }),
  ],
  markdown: {
    remarkPlugins: [
      [
        remarkWikiLink,
        {
          pageResolver: (name) => [name.toLowerCase().replace(/ /g, '_')],
          hrefTemplate: (permalink) => `/wiki/${permalink}`,
        },
      ],
    ],
    shikiConfig: {
      theme: 'github-light',
    },
  },
});
