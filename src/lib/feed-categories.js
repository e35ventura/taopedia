// Trim, drop blanks, and dedupe feed item categories, preserving first-seen order.
// An article whose frontmatter lists the same category twice is a real data
// condition — the same one buildCategories/buildStatistics count distinctly (#1472).

export function uniqueFeedCategories(categories) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(categories) ? categories : []) {
    const value = String(raw ?? '').trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}
