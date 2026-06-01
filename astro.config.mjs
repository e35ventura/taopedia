import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkWikiLink from 'remark-wiki-link';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Redirect aliases from page frontmatter (`redirects:`), generated during
// `prebuild` by scripts/build-linkgraph.js. Astro emits a static redirect page
// for each entry. Absent during `astro dev` (prebuild doesn't run), so default
// to no redirects.
let redirects = {};
try {
  redirects = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'public', 'data', 'redirects.json'), 'utf-8')
  );
} catch {
  // redirects.json not generated yet — no redirects to register.
}

// https://astro.build/config
export default defineConfig({
  site: 'https://taopedia.org',
  redirects,
  // Bind IPv4 loopback explicitly: this machine's IPv6 loopback (::1) refuses
  // connections, so Astro's default ::1 bind made localhost:4321 unreachable.
  server: { host: '127.0.0.1' },
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
