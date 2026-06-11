import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wikiDir = path.join(path.resolve(__dirname, '..'), 'dist', 'wiki');

assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');

const infoFiles = fs
  .readdirSync(wikiDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => path.join(wikiDir, e.name, 'info.json'))
  .filter((p) => fs.existsSync(p));

assert.ok(infoFiles.length > 0, 'no per-article info.json endpoints were built');

let withRevisions = 0;
let withIncoming = 0;
for (const file of infoFiles) {
  const raw = fs.readFileSync(file, 'utf8');
  const info = JSON.parse(raw);
  const where = path.relative(wikiDir, file);

  assert.equal(typeof info.title, 'string', `${where}: title must be a string`);
  assert.match(info.url, /^https?:\/\/[^/]+\/wiki\/.+\/$/, `${where}: url must be the canonical trailing-slash article URL`);
  assert.ok(Array.isArray(info.categories), `${where}: categories must be an array`);
  assert.ok(Number.isInteger(info.wordCount) && info.wordCount >= 0, `${where}: wordCount must be a non-negative integer`);
  assert.ok(Number.isInteger(info.revisionCount) && info.revisionCount >= 0, `${where}: revisionCount must be a non-negative integer`);
  assert.ok(Number.isInteger(info.outgoingLinks) && info.outgoingLinks >= 0, `${where}: outgoingLinks must be a non-negative integer`);
  assert.ok(Number.isInteger(info.incomingLinks) && info.incomingLinks >= 0, `${where}: incomingLinks must be a non-negative integer`);
  // lastEditor is a display name or null — never an email address (privacy, #101).
  assert.ok(info.lastEditor === null || typeof info.lastEditor === 'string', `${where}: lastEditor must be a string or null`);
  assert.ok(!raw.includes('@'), `${where}: info.json must not expose any email address`);
  // When there are revisions, the edit metadata must be coherent.
  if (info.revisionCount > 0) {
    withRevisions += 1;
    assert.ok(typeof info.lastEdited === 'string' && !Number.isNaN(Date.parse(info.lastEdited)), `${where}: lastEdited must be a date when revisions exist`);
    assert.ok(typeof info.firstEdited === 'string', `${where}: firstEdited must be set when revisions exist`);
    assert.ok(info.lastEdited >= info.firstEdited, `${where}: lastEdited must be >= firstEdited`);
  }
  if (info.incomingLinks > 0) withIncoming += 1;
}

// The link-graph wiring must actually surface real backlinks for at least the
// well-linked hubs, not be uniformly zero.
assert.ok(withIncoming > 0, 'no article reported incoming links; backlink wiring is broken');
assert.ok(withRevisions > 0, 'no article reported revisions; history wiring is broken');

console.log(`Page-info check passed (${infoFiles.length} endpoints; ${withRevisions} with history, ${withIncoming} with backlinks)`);
