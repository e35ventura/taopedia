// Numbered titles like "Subnet 9: Pre-training" must order before
// "Subnet 10: Sturdy", so titles are compared with numeric collation. The
// locale is pinned so the generated page order does not depend on the build
// machine's locale.
export const compareTitles = (a, b) => a.localeCompare(b, 'en', { numeric: true });

export const sortPagesByTitle = (pages) =>
  [...pages].sort((a, b) => compareTitles(a.data.title, b.data.title));
