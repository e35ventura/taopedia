// Pure visibility logic for the Contents-sidebar collapse/expand control
// (src/layouts/WikiLayout.astro). Extracted here so the decision — which
// descendant rows a toggle should show or hide — can be unit-tested without a
// browser, the same pattern the rest of the wiki helpers follow.
//
// The TOC is a flat list of <li> rows, each tagged with a heading depth
// (data-toc-level). A row's "descendants" are the contiguous run of following
// rows whose level is deeper than the toggled row, up to the next row at the
// toggled row's level or shallower.
//
// Collapsing hides every descendant. Expanding is the subtle case: a descendant
// must be revealed ONLY when no collapsed ancestor sits between it and the
// toggled row. A subsection that is itself collapsed keeps its own deeper rows
// hidden, so expanding an outer section must not override a still-collapsed
// inner one.

/**
 * Decide each following row's new display value when a TOC section is toggled.
 *
 * @param {number} parentLevel - heading depth of the toggled row.
 * @param {boolean} expanded - true if the toggled row is now expanded (open),
 *   false if it is now collapsed.
 * @param {Array<{ level: number, collapsed: boolean }>} rows - the rows that
 *   FOLLOW the toggled row, in document order, each with its heading depth and
 *   whether it is itself currently collapsed.
 * @returns {Array<'none' | 'flex' | null>} one entry per input row: 'none' to
 *   hide, 'flex' to show, or null to leave untouched (rows at or above
 *   parentLevel, i.e. outside this section, and everything after them).
 */
export function computeTocVisibility(parentLevel, expanded, rows) {
  const result = [];
  // The depth of the shallowest collapsed ancestor whose subtree we are still
  // inside while expanding; Infinity means nothing is currently hiding rows.
  let hiddenBelowLevel = Infinity;
  let pastSection = false;

  for (const row of rows) {
    if (pastSection) {
      result.push(null);
      continue;
    }

    const level = Number(row?.level);
    if (!(level > parentLevel)) {
      // A sibling or shallower heading ends this section's descendants.
      pastSection = true;
      result.push(null);
      continue;
    }

    if (!expanded) {
      // Collapsing the section hides every descendant outright.
      result.push('none');
      continue;
    }

    // Expanding: returning to the collapsed ancestor's level (or shallower)
    // leaves its hidden subtree, so clear the marker before deciding this row.
    if (level <= hiddenBelowLevel) hiddenBelowLevel = Infinity;

    if (level > hiddenBelowLevel) {
      // Still inside a collapsed inner subsection — keep it hidden.
      result.push('none');
    } else {
      result.push('flex');
      // A collapsed descendant hides its own deeper rows from here on.
      if (row?.collapsed) hiddenBelowLevel = level;
    }
  }

  return result;
}
