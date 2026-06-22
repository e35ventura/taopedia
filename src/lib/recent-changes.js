// Single source of truth for the recent-changes cap, shared by the HTML
// Special:RecentChanges page (recentchanges.astro), the JSON endpoint
// (recentchanges.json.ts), and both regression checks so the surfaces can never
// claim different limits. Kept as plain JS (like title-sort.js) so the Node
// regression checks can import the same constant the Astro pages use.
export const RECENT_LIMIT = 100;
