// Numbered titles like "Subnet 9: Pre-training" must order before
// "Subnet 10: Sturdy", so titles are compared with numeric collation. The
// locale is pinned so the generated page order does not depend on the build
// machine's locale.
export const compareTitles = (a, b) => a.localeCompare(b, 'en', { numeric: true });

// Titles are not guaranteed unique (nothing enforces it across the content
// collection), so two same-title pages would otherwise fall back to the
// import.meta.glob traversal order and could swap places between builds. Break
// ties on the stable, unique entry id with a plain code-unit comparison (not
// localeCompare, whose ordering can vary by build-machine locale) so the
// rendered list order is deterministic.
export const sortPagesByTitle = (pages) =>
  [...pages].sort(
    (a, b) =>
      compareTitles(a.data.title, b.data.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
