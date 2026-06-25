import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseGitLog, resetHistoryOutputDir } from './generate-history.js';

const FIELD_SEP = '\x00';
const record = (sha, an, ae, at, msg) => [sha, an, ae, at, msg].join(FIELD_SEP);

// Three commits given in ASCENDING (oldest-first) author-date order — the
// OPPOSITE of the newest-first order consumers require — to verify parseGitLog
// re-sorts to newest-author-date-first. Records are newline-joined exactly as
// `git log --pretty=format:` emits. One subject contains "|", one author name is
// empty.
const sha1 = 'a'.repeat(40); // oldest (1700000000)
const sha2 = 'b'.repeat(40); // middle (1700000100)
const sha3 = 'c'.repeat(40); // newest (1700000200)
const stdout = [
  record(sha1, 'Alice Example', 'alice@example.com', '1700000000', 'fix: handle a | b | c'),
  record(sha2, '', 'noauthor@example.com', '1700000100', 'chore: tidy'),
  record(sha3, 'Bob', 'bob@example.com', '1700000200', 'docs: update'),
].join('\n');

const parsed = parseGitLog(stdout);

assert.equal(parsed.length, 3, 'all three commits must parse');

// Revisions must be sorted newest author-date first regardless of input order,
// so revisions[0] is the latest edit (lastEdited / lastmod) and the last entry
// is the creation (firstEdited) — even after a rebase / backdated commit.
assert.deepEqual(
  parsed.map((r) => r.timestamp),
  [1700000200, 1700000100, 1700000000],
  'parseGitLog must sort revisions newest author-date first',
);

// Commit subjects containing "|" must be preserved in full (regression for the
// old `line.split('|')` parser that truncated at the first pipe). sha1 carries
// the pipe subject and is the oldest, so it sorts last.
assert.equal(parsed[2].message, 'fix: handle a | b | c', 'pipe in subject must be preserved');

// Every SHA must be a clean hex string with no leading separator (regression for
// the record-framing bug where "\n" leaked into later SHAs).
for (const revision of parsed) {
  assert.match(revision.sha, /^[0-9a-f]{40}$/, `clean sha required, got ${JSON.stringify(revision.sha)}`);
}
assert.equal(parsed[0].sha, sha3, 'newest commit (sha3) sorts first with a clean sha');

// An empty field (author name) must not misalign later fields. sha2 has the
// middle timestamp, so it stays at index 1 after sorting.
assert.equal(parsed[1].authorName, '', 'empty author name preserved');
assert.equal(parsed[1].authorEmail, 'noauthor@example.com', 'email not shifted into author slot');
assert.equal(parsed[1].message, 'chore: tidy', 'message not shifted by empty field');

// Timestamps and derived dates (sha1 is oldest, so it sorts last).
assert.equal(parsed[2].timestamp, 1700000000, 'timestamp parsed as integer');
assert.equal(parsed[2].date, new Date(1700000000 * 1000).toISOString(), 'ISO date derived from timestamp');

// Empty output and malformed records are ignored, not crashed on.
assert.deepEqual(parseGitLog(''), [], 'empty output yields no revisions');
assert.deepEqual(parseGitLog('not-a-record'), [], 'records without the field separator are skipped');
assert.deepEqual(
  parseGitLog(`zzz${FIELD_SEP}x${FIELD_SEP}x${FIELD_SEP}1${FIELD_SEP}bad sha`),
  [],
  'records whose first field is not a SHA are skipped'
);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taopedia-history-output-'));
try {
  const historyDir = path.join(tempRoot, 'history');
  const staleNestedDir = path.join(historyDir, 'removed');
  fs.mkdirSync(staleNestedDir, { recursive: true });
  fs.writeFileSync(path.join(historyDir, 'stale.json'), '{"slug":"stale"}');
  fs.writeFileSync(path.join(staleNestedDir, 'old.json'), '{"slug":"removed/old"}');

  resetHistoryOutputDir(historyDir);

  assert.ok(fs.existsSync(historyDir), 'history output directory should be recreated');
  assert.deepEqual(
    fs.readdirSync(historyDir),
    [],
    'history generator should clear stale JSON files before writing current articles',
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('History parser check passed');
