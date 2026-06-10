import assert from 'node:assert/strict';
import { escapeHtml, splitLongWords, wrapText } from '../src/lib/og-text.js';

// --- escapeHtml: neutralizes the characters that would break SVG <text> markup ---
assert.equal(escapeHtml('a & b < c > d "e"'), 'a &amp; b &lt; c &gt; d &quot;e&quot;');
assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
assert.equal(escapeHtml('plain title 123'), 'plain title 123');
// Ampersand is escaped first so a literal "<" becomes "&lt;", not "&amp;lt;".
assert.equal(escapeHtml('1 < 2 & 3'), '1 &lt; 2 &amp; 3');
// Non-ASCII / emoji pass through unchanged (titles like "Subnet 86: ⚒").
assert.equal(escapeHtml('Subnet 86: ⚒'), 'Subnet 86: ⚒');
// Single quotes are intentionally left alone (SVG attrs here use double quotes).
assert.equal(escapeHtml("it's fine"), "it's fine");

// --- splitLongWords: hard-breaks any token longer than the line budget ---
assert.deepEqual(splitLongWords(['short', 'words'], 24), ['short', 'words']);
// A token exactly maxChars long is kept whole (boundary).
assert.deepEqual(splitLongWords(['x'.repeat(24)], 24), ['x'.repeat(24)]);
// A longer token is split into maxChars-sized chunks plus the remainder.
assert.deepEqual(splitLongWords(['x'.repeat(50)], 24), ['x'.repeat(24), 'x'.repeat(24), 'xx']);
assert.deepEqual(splitLongWords(['ok', 'y'.repeat(30)], 24), ['ok', 'y'.repeat(24), 'yyyyyy']);

// --- wrapText: wraps to <= maxLines lines of <= maxChars, ellipsizing overflow ---
assert.deepEqual(wrapText('', 24, 3), []);
assert.deepEqual(wrapText('   ', 24, 3), []);
assert.deepEqual(wrapText('anything', 24, 0), []);

// Fits on a single line.
assert.deepEqual(wrapText('Proof of Stake', 24, 3), ['Proof of Stake']);

// Wraps across lines, each within the character budget.
const wrapped = wrapText('alpha beta gamma delta epsilon', 12, 3);
assert.deepEqual(wrapped, ['alpha beta', 'gamma delta', 'epsilon']);
for (const line of wrapped) assert.ok(line.length <= 12, `line over budget: "${line}"`);

// Content that fits exactly within maxLines must NOT gain a stray ellipsis.
const exact = wrapText('aaaa bbbb cccc', 4, 3);
assert.deepEqual(exact, ['aaaa', 'bbbb', 'cccc']);
assert.ok(!exact.some((line) => line.endsWith('…')), 'no ellipsis when content fits');

// Content exceeding maxLines is truncated with an ellipsis on the last line.
const truncated = wrapText('one two three four five six seven eight nine ten', 8, 2);
assert.equal(truncated.length, 2);
assert.ok(truncated[1].endsWith('…'), 'overflow must ellipsize the last line');

// A single overlong token is hard-split first, so it can never overflow the card.
const longToken = wrapText('x'.repeat(40), 10, 3);
assert.equal(longToken.length, 3);
for (const line of longToken) {
  assert.ok(line.length <= 10 || line.endsWith('…'), `overlong-token line not constrained: "${line}"`);
}

console.log('OG text layout check passed');
