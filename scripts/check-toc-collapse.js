import assert from 'node:assert/strict';
import { computeTocVisibility } from '../src/lib/toc-collapse.js';

// Guards the Contents-sidebar collapse/expand visibility logic
// (src/lib/toc-collapse.js, consumed by src/layouts/WikiLayout.astro). The
// load-bearing property is the nested case: expanding an outer section must not
// reveal a deeper row whose own intermediate subsection is still collapsed.

// A three-level section: A (h2) > A.1 (h3) > A.1.1 (h4), then sibling A.2 (h3).
// These are the rows that FOLLOW the toggled A row, in document order.
const nested = [
  { level: 3, collapsed: true }, // A.1 — individually collapsed
  { level: 4, collapsed: false }, // A.1.1 — child of the collapsed A.1
  { level: 3, collapsed: false }, // A.2
];

// Expanding A must show A.1 and A.2 but keep A.1.1 hidden (A.1 is collapsed).
assert.deepEqual(
  computeTocVisibility(2, true, nested),
  ['flex', 'none', 'flex'],
  'expanding an outer section must not reveal rows under a still-collapsed inner subsection',
);

// Collapsing A hides every descendant regardless of inner state.
assert.deepEqual(
  computeTocVisibility(2, false, nested),
  ['none', 'none', 'none'],
  'collapsing a section hides all of its descendants',
);

// When no inner subsection is collapsed, expanding reveals the whole subtree.
const allOpen = [
  { level: 3, collapsed: false },
  { level: 4, collapsed: false },
  { level: 3, collapsed: false },
];
assert.deepEqual(
  computeTocVisibility(2, true, allOpen),
  ['flex', 'flex', 'flex'],
  'expanding reveals every descendant when no inner subsection is collapsed',
);

// Rows at or above the toggled level (a sibling/ancestor and everything after)
// are outside the section and must be left untouched (null).
const withSibling = [
  { level: 3, collapsed: false }, // descendant
  { level: 2, collapsed: false }, // sibling h2 — ends the section
  { level: 3, collapsed: false }, // belongs to the sibling, not the toggled row
];
assert.deepEqual(
  computeTocVisibility(2, true, withSibling),
  ['flex', null, null],
  'rows from the next same-or-shallower heading onward are left untouched',
);

// A collapsed ancestor deeper than one level still suppresses its whole subtree,
// and a sibling of that ancestor (back at its level) reappears.
const deep = [
  { level: 3, collapsed: true }, // B.1 collapsed
  { level: 4, collapsed: false }, // B.1.1 hidden under B.1
  { level: 5, collapsed: false }, // B.1.1.1 hidden under B.1
  { level: 4, collapsed: false }, // B.1.2 hidden under B.1 (still inside B.1)
  { level: 3, collapsed: false }, // B.2 — back at B.1's level, visible again
];
assert.deepEqual(
  computeTocVisibility(2, true, deep),
  ['flex', 'none', 'none', 'none', 'flex'],
  'a collapsed subsection suppresses its entire subtree until the tree returns to its level',
);

console.log('TOC collapse visibility check passed (nested expand/collapse, sibling boundary, deep subtree)');
