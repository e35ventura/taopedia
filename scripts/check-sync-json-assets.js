import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateArticleJsonAsset } from './sync-articles.js';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taopedia-sync-json-'));

try {
  const articleDir = path.join(tempRoot, 'articles', 'content', 'pages', 'json_asset');
  const validJson = path.join(articleDir, 'metadata.json');
  const malformedInfobox = path.join(articleDir, 'infobox.json');
  const emptyJson = path.join(articleDir, 'empty.json');

  fs.mkdirSync(articleDir, { recursive: true });
  fs.writeFileSync(
    validJson,
    JSON.stringify({
      title: 'Valid Infobox',
      rows: [{ label: 'Type', value: 'Fixture' }],
    }),
  );
  fs.writeFileSync(malformedInfobox, '{ invalid json');
  fs.writeFileSync(emptyJson, '');

  assert.doesNotThrow(
    () => validateArticleJsonAsset(validJson),
    'valid JSON article assets should be accepted during sync',
  );
  assert.throws(
    () => validateArticleJsonAsset(malformedInfobox),
    /Malformed JSON asset.*infobox\.json/,
    'malformed infobox JSON should be rejected before Astro imports it',
  );
  assert.throws(
    () => validateArticleJsonAsset(emptyJson),
    /Malformed JSON asset.*empty\.json/,
    'empty JSON assets should be rejected before copying',
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('Sync JSON asset validation check passed');
