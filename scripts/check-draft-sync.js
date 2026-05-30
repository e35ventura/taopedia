import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taopedia-articles-'));
const pagesRoot = path.join(fixtureRoot, 'content', 'pages');
const targetRoot = path.join(process.cwd(), 'src', 'content', 'pages');

function writeArticle(slug, frontmatter) {
  const dir = path.join(pagesRoot, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'index.mdx'),
    `---\ntitle: ${frontmatter.title}\nsummary: ${frontmatter.summary}\ncategory: ${frontmatter.category}\ntags: ${frontmatter.tags}\n${frontmatter.draft ? 'draft: true\n' : ''}---\n\n# ${frontmatter.title}\n`
  );
}

writeArticle('published_article', {
  title: 'Published Article',
  summary: 'Published Bittensor article.',
  category: 'Testing',
  tags: '["Bittensor"]',
});
writeArticle('draft_article', {
  title: 'Draft Article',
  summary: 'Draft Bittensor article.',
  category: 'Testing',
  tags: '["Bittensor"]',
  draft: true,
});

execFileSync(process.execPath, ['scripts/sync-articles.js'], {
  cwd: process.cwd(),
  env: { ...process.env, TAOPEDIA_ARTICLES_DIR: fixtureRoot },
  stdio: 'inherit',
});

assert.equal(
  fs.existsSync(path.join(targetRoot, 'published_article', 'index.mdx')),
  true,
  'non-draft Bittensor articles should sync'
);
assert.equal(
  fs.existsSync(path.join(targetRoot, 'draft_article', 'index.mdx')),
  false,
  'draft Bittensor articles should not sync'
);

fs.rmSync(fixtureRoot, { recursive: true, force: true });
console.log('Draft article sync filter check passed');
