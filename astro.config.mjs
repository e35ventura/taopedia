// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  site: 'https://taopedia.org',
  integrations: [mdx()],
  markdown: {
    remarkPlugins: [
      ['remark-wiki-link', { 
        pageResolver: (name) => [name.toLowerCase().replace(/ /g, '_')],
        hrefTemplate: (permalink) => `/wiki/${permalink}`
      }]
    ],
    shikiConfig: {
      theme: 'github-light'
    }
  }
});
