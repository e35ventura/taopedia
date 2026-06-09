import assert from 'node:assert/strict';
import { parseGitLog } from './generate-history.js';

const FIELD_SEP = '\x00';
const record = (sha, an, ae, at, msg) => [sha, an, ae, at, msg].join(FIELD_SEP);

// Three commits: a subject containing "|", an empty author name, and a normal
// commit. Records are newline-joined exactly as `git log --pretty=format:` emits.
const sha1 = 'a'.repeat(40);
const sha2 = 'b'.repeat(40);
const sha3 = 'c'.repeat(40);
const stdout = [
  record(sha1, 'Alice Example', 'alice@example.com', '1700000000', 'fix: handle a | b | c'),
  record(sha2, '', 'noauthor@example.com', '1700000100', 'chore: tidy'),
  record(sha3, 'Bob', 'bob@example.com', '1700000200', 'docs: update'),
].join('\n');

const parsed = parseGitLog(stdout);

assert.equal(parsed.length, 3, 'all three commits must parse');

// Commit subjects containing "|" must be preserved in full (regression for the
// old `line.split('|')` parser that truncated at the first pipe).
assert.equal(parsed[0].message, 'fix: handle a | b | c', 'pipe in subject must be preserved');

// Every SHA must be a clean hex string with no leading separator (regression for
// the record-framing bug where "\n" leaked into later SHAs).
for (const revision of parsed) {
  assert.match(revision.sha, /^[0-9a-f]{40}$/, `clean sha required, got ${JSON.stringify(revision.sha)}`);
}
assert.equal(parsed[2].sha, sha3, 'third sha must not carry a leading newline');

// An empty field (author name) must not misalign later fields.
assert.equal(parsed[1].authorName, '', 'empty author name preserved');
assert.equal(parsed[1].authorEmail, 'noauthor@example.com', 'email not shifted into author slot');
assert.equal(parsed[1].message, 'chore: tidy', 'message not shifted by empty field');

// Timestamps and derived dates.
assert.equal(parsed[0].timestamp, 1700000000, 'timestamp parsed as integer');
assert.equal(parsed[0].date, new Date(1700000000 * 1000).toISOString(), 'ISO date derived from timestamp');

// Empty output and malformed records are ignored, not crashed on.
assert.deepEqual(parseGitLog(''), [], 'empty output yields no revisions');
assert.deepEqual(parseGitLog('not-a-record'), [], 'records without the field separator are skipped');
assert.deepEqual(
  parseGitLog(`zzz${FIELD_SEP}x${FIELD_SEP}x${FIELD_SEP}1${FIELD_SEP}bad sha`),
  [],
  'records whose first field is not a SHA are skipped'
);

console.log('History parser check passed');
