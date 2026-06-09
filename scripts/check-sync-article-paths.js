import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertRegularFileInside } from './sync-articles.js';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taopedia-sync-paths-'));

try {
  const articlesRoot = path.join(tempRoot, 'articles');
  const pageDir = path.join(articlesRoot, 'content', 'pages', 'safe_article');
  const entryFile = path.join(pageDir, 'index.mdx');
  const outsideFile = path.join(tempRoot, 'outside-secret.mdx');
  const symlinkedEntry = path.join(pageDir, 'linked-index.mdx');
  const directoryEntry = path.join(pageDir, 'not-a-file');

  fs.mkdirSync(pageDir, { recursive: true });
  fs.writeFileSync(entryFile, '---\ntitle: Safe Article\n---\n\nBody\n');
  fs.writeFileSync(outsideFile, '---\ntitle: Outside\n---\n\nSECRET_FROM_OUTSIDE_ARTICLES_ROOT\n');
  fs.symlinkSync(outsideFile, symlinkedEntry);
  fs.mkdirSync(directoryEntry);

  assert.doesNotThrow(
    () => assertRegularFileInside(articlesRoot, entryFile, 'Article entry'),
    'regular article entry inside the articles root should be accepted',
  );
  assert.throws(
    () => assertRegularFileInside(articlesRoot, symlinkedEntry, 'Article entry'),
    /must not be a symlink/,
    'symlinked article entries should be rejected before readFileSync can follow them',
  );
  assert.throws(
    () => assertRegularFileInside(articlesRoot, outsideFile, 'Article entry'),
    /inside article source root/,
    'regular files outside the articles root should not be accepted as article entries',
  );
  assert.throws(
    () => assertRegularFileInside(articlesRoot, directoryEntry, 'Article entry'),
    /regular file/,
    'article entries must be regular files',
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('Sync article path check passed');
