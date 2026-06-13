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


// Astral-plane characters (e.g. emoji, 2 UTF-16 units each) must never be
// split mid-surrogate-pair -- a lone surrogate inside the SVG <text> content
// is invalid and breaks OG image rendering. The original UTF-16-unit width
// budget (maxChars) must still be respected per chunk.
const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// 'A' (1 unit) + 20 emoji (2 units each) = 41 units, over a 24-unit budget.
const emojiWord = 'A' + '\u{1F984}'.repeat(20);
const emojiChunks = splitLongWords([emojiWord], 24);
for (const chunk of emojiChunks) {
  assert.ok(!loneSurrogate.test(chunk), `chunk has a lone surrogate: ${JSON.stringify(chunk)}`);
  assert.ok(chunk.length <= 24, `chunk over UTF-16 unit budget: ${JSON.stringify(chunk)} (${chunk.length})`);
}
assert.equal(emojiChunks.join(''), emojiWord, 'chunks must reconstruct the original word');
// 'A' + 11 emoji = 23 units (12th emoji would make 25, over budget).
assert.equal(emojiChunks[0], 'A' + '\u{1F984}'.repeat(11));

// Pure-emoji run: 30 emoji x 2 units = 60 units, 24-unit budget -> 12 emoji
// (24 units) per chunk for the first two chunks, 6 emoji (12 units) last.
const longEmojiWord = '\u{1F984}'.repeat(30);
const longEmojiChunks = splitLongWords([longEmojiWord], 24);
assert.equal(longEmojiChunks.length, 3);
for (const chunk of longEmojiChunks) {
  assert.ok(!loneSurrogate.test(chunk), `chunk has a lone surrogate: ${JSON.stringify(chunk)}`);
  assert.ok(chunk.length <= 24, `chunk over UTF-16 unit budget: ${JSON.stringify(chunk)} (${chunk.length})`);
}
assert.equal(longEmojiChunks.join(''), longEmojiWord, 'chunks must reconstruct the original word');
assert.equal(longEmojiChunks[0].length, 24);
assert.equal(longEmojiChunks[1].length, 24);
assert.equal(longEmojiChunks[2].length, 12);

console.log('OG text layout check passed');
