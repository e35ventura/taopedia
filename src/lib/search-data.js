import { compareTitles } from './title-sort.js';

export function sortSearchEntries(entries = []) {
  return [...entries].sort(
    (a, b) => compareTitles(a.title, b.title) || compareTitles(a.url, b.url),
  );
}
