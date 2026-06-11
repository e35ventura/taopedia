import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArticleSourceFile } from './sync-articles.js';
import { resolveHistorySourcePath } from './generate-history.js';

// An article authored as plain Markdown (index.md) must be published, not
// silently skipped: copyDir, the content-collection glob, and the history
// walker already accept index.md, so the publish and history lookups must too.

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'taopedia-md-'));
try {
  // --- sync source-file resolution ---
  const root = path.join(tmp, 'pages');
  const makeArticle = (slug, files) => {
    const dir = path.join(root, slug);
    fs.mkdirSync(dir, { recursive: true });
    for (const file of files) {
      fs.writeFileSync(path.join(dir, file), '---\ntitle: Test\n---\n\nBody.\n');
    }
    return dir;
  };

  const mdxDir = makeArticle('mdx-only', ['index.mdx']);
  const mdDir = makeArticle('md-only', ['index.md']);
  const bothDir = makeArticle('both', ['index.mdx', 'index.md']);
  const neitherDir = makeArticle('neither', []);

  assert.equal(
    path.basename(resolveArticleSourceFile(mdxDir, root, 'mdx-only')),
    'index.mdx',
    'an index.mdx source must resolve',
  );
  assert.equal(
    path.basename(resolveArticleSourceFile(mdDir, root, 'md-only')),
    'index.md',
    'a plain-Markdown index.md source must resolve instead of being silently skipped',
  );
  assert.equal(
    path.basename(resolveArticleSourceFile(bothDir, root, 'both')),
    'index.mdx',
    'index.mdx must take precedence when both index files exist',
  );
  assert.equal(
    resolveArticleSourceFile(neitherDir, root, 'neither'),
    null,
    'a directory with no index file must resolve to null',
  );

  // The security validation must be preserved: a symlinked index file is a hard
  // error, never silently skipped.
  const symlinkDir = path.join(root, 'symlinked');
  fs.mkdirSync(symlinkDir, { recursive: true });
  fs.symlinkSync(path.join(mdxDir, 'index.mdx'), path.join(symlinkDir, 'index.mdx'));
  assert.throws(
    () => resolveArticleSourceFile(symlinkDir, root, 'symlinked'),
    /must not be a symlink/,
    'a symlinked index file must be rejected, not silently skipped',
  );

  // --- history source-path resolution ---
  const repo = path.join(tmp, 'repo');
  const makeSource = (slug, name) => {
    const dir = path.join(repo, 'content', 'pages', slug);
    fs.mkdirSync(dir, { recursive: true });
    if (name) fs.writeFileSync(path.join(dir, name), 'source');
  };
  makeSource('a', 'index.mdx');
  makeSource('b', 'index.md');
  makeSource('c', null);

  assert.equal(
    resolveHistorySourcePath(repo, 'a'),
    'content/pages/a/index.mdx',
    'history must follow an index.mdx source',
  );
  assert.equal(
    resolveHistorySourcePath(repo, 'b'),
    'content/pages/b/index.md',
    'history must follow an index.md source when that is what exists',
  );
  assert.equal(
    resolveHistorySourcePath(repo, 'c'),
    'content/pages/c/index.mdx',
    'history falls back to index.mdx when neither index file exists',
  );
  assert.equal(
    resolveHistorySourcePath(null, 'a'),
    'content/pages/a/index.mdx',
    'history falls back to index.mdx when no source repo is available',
  );

  console.log('Markdown article source check passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
