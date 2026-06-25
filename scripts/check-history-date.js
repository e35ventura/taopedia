import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { formatRevisionDate } from '../src/lib/format-date.js';

const iso = '2026-06-01T16:55:13.000Z';
const reference = formatRevisionDate(iso);

// The formatted time must carry a UTC label and reflect the UTC wall clock
// (04:55), not the build machine's local time.
assert.match(reference, /UTC$/, 'revision dates must carry a UTC timezone label');
assert.match(reference, /June 1, 2026/, 'revision date must render the correct UTC calendar date');
assert.ok(reference.includes('04:55'), `revision date must render the UTC time 04:55, got "${reference}"`);

// The build must be deterministic: the same instant must render identically
// regardless of the build machine's timezone (a local preview must match the
// UTC production build). Without a pinned timeZone this fails (e.g. New York
// would render 12:55 instead of 04:55).
const helperUrl = new URL('../src/lib/format-date.js', import.meta.url).href;
const probe = `import(${JSON.stringify(helperUrl)}).then((m) => process.stdout.write(m.formatRevisionDate(${JSON.stringify(iso)})));`;
for (const tz of ['America/New_York', 'Asia/Kolkata', 'Pacific/Auckland', 'UTC']) {
  const out = execFileSync(process.execPath, ['-e', probe], {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  });
  assert.equal(out, reference, `revision date must be timezone-independent (TZ=${tz})`);
}

// A missing or unparseable timestamp degrades to an empty string rather than the
// literal "Invalid Date" the raw Date(...).toLocaleString() would otherwise emit
// into the visible <time> element. collectRecentChanges keeps any entry that
// merely carries a non-empty date string, so a malformed value can reach here.
assert.equal(formatRevisionDate(''), '', 'an empty timestamp must render as an empty string');
assert.equal(formatRevisionDate(undefined), '', 'a missing timestamp must render as an empty string');
assert.equal(formatRevisionDate('not-a-date'), '', 'an unparseable timestamp must render as an empty string');

console.log('History date check passed');
