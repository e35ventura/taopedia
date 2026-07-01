import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing check for the TOC footer "Back to top" control. It must target
// the same #content landmark as the skip link so keyboard and in-page readers
// return to the article body instead of leaving a bare # fragment in the URL.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const articlePage = fs.readFileSync(
  path.join(projectRoot, 'src', 'pages', 'wiki', '[...slug].astro'),
  'utf8',
);
const tocSidebar = fs.readFileSync(
  path.join(projectRoot, 'src', 'features', 'wiki', 'components', 'TocSidebar.astro'),
  'utf8',
);
const layout = fs.readFileSync(
  path.join(projectRoot, 'src', 'layouts', 'WikiLayout.astro'),
  'utf8',
);

assert.match(
  articlePage,
  /<a\s+href="#content"\s+class="toc-back-to-top"\s+aria-label="Back to top">/,
  'article TOC footer must link back to the #content landmark',
);
assert.match(
  tocSidebar,
  /<a\s+href="#content"\s+class="toc-back-to-top"\s+aria-label="Back to top">/,
  'feature TOC sidebar must link back to the #content landmark',
);
assert.doesNotMatch(
  articlePage,
  /class="toc-back-to-top"[^>]*href="#"/,
  'article TOC footer must not use a bare # href',
);
assert.match(
  layout,
  /<main\s+id="content"\s+class="mw-body"\s+tabindex="-1">/,
  'wiki layout must expose a focusable #content landmark for back-to-top navigation',
);

console.log('TOC back-to-top check passed');
