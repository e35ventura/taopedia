import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The revision-history page renders only the author name, date, message, and
// short SHA. The served /history/<slug>.json must therefore not carry
// contributor email addresses (data minimization): emails are parsed for record
// alignment but never displayed, and publishing them exposes personal PII in a
// machine-readable endpoint no page consumes.

const historyDir = path.join(process.cwd(), 'dist', 'history');
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;

assert.ok(
  fs.existsSync(historyDir),
  'dist/history must exist; run npm run build first',
);

function walkJsonFiles(dir, fileList = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(filePath, fileList);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const historyFiles = walkJsonFiles(historyDir);
assert.ok(historyFiles.length > 0, 'dist/history must contain served history files');

const emailFieldHits = [];
const emailValueHits = [];
let revisionCount = 0;

for (const filePath of historyFiles) {
  const relativePath = path.relative(process.cwd(), filePath);
  const { history } = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(history)) continue;

  for (const revision of history) {
    revisionCount += 1;

    if ('authorEmail' in revision) {
      emailFieldHits.push(`${relativePath}: ${revision.sha ?? '(no sha)'}`);
    }

    // Author names should never look like an email. Commit messages are not
    // checked because they can legitimately contain @-mentions or addresses.
    if (typeof revision.authorName === 'string' && EMAIL_PATTERN.test(revision.authorName)) {
      emailValueHits.push(`${relativePath}: ${revision.authorName}`);
    }
  }
}

assert.ok(revisionCount > 0, 'served history must contain revision records to validate');

assert.equal(
  emailFieldHits.length,
  0,
  `served history records must not carry an authorEmail field:\n${emailFieldHits.slice(0, 10).join('\n')}`,
);

assert.equal(
  emailValueHits.length,
  0,
  `served history author names must not contain email addresses:\n${emailValueHits.slice(0, 10).join('\n')}`,
);

console.log(`History privacy check passed (${revisionCount} revisions across ${historyFiles.length} files)`);
