# Visual evidence: special-pages slugmap + share-preview PR

Captured from local `npm run build` preview at viewport **1280×800**.

## 1. Special:AllPages — no visible layout change (artifact-read only)

| Field | Value |
|-------|-------|
| **Page URL** | `/wiki/special/allpages/` |
| **Viewport** | 1280px desktop |
| **Action** | Load page; verify article directory, filters, and counts |
| **Before** | 350 articles across 38 topics; topic filter pills; featured cards — all sourced via `getCollection('pages')` |
| **After** | Identical layout and counts; metadata from `slugmap.json` via `sortedPagesFromSlugMap()` |
| **Share meta change** | `og:image` → `https://taopedia.org/og/active_uid.png` (first title-sorted article) instead of generic `home.png` |

## 2. Special:Statistics — no visible layout change

| Field | Value |
|-------|-------|
| **Page URL** | `/wiki/special/statistics/` |
| **Viewport** | 1280px desktop |
| **Action** | Load page; verify stat rows (Articles 350, Topics 38, etc.) |
| **Before** | Inline aggregation + `localeCompare` topic tiebreak |
| **After** | Shared `buildStatistics()` with `categories.json` — same figures as `statistics.json` |
| **Share meta** | `og:image` remains `https://taopedia.org/og/home.png` (unchanged) |

## 3. Special:MostLinkedPages — no visible layout change

| Field | Value |
|-------|-------|
| **Page URL** | `/wiki/special/mostlinkedpages/` |
| **Viewport** | 1280px desktop |
| **Action** | Load ranked list |
| **Before** | `getCollection` for `titleBySlug` |
| **After** | `publishedTitleBySlug()` from slugmap — same ranking via `buildMostLinkedPages()` |
| **Share meta change** | `og:image` → `https://taopedia.org/og/dynamic_tao.png` (top-ranked article) |

## 4. Special:RecentChanges — no visible layout change

| Field | Value |
|-------|-------|
| **Page URL** | `/wiki/special/recentchanges/` |
| **Viewport** | 1280px desktop |
| **Action** | Load newest-first change list |
| **Before** | Already used slugmap titles; `og:image` defaulted to `home.png` |
| **After** | Same list; `og:image` → `https://taopedia.org/og/validator_permit.png` (newest change) |

## 5. Category hub — no visible layout change (share-preview meta only)

| Field | Value |
|-------|-------|
| **Page URL** | `/wiki/category/Consensus/` |
| **Viewport** | 1280px desktop |
| **Action** | Load category card grid; inspect `<meta property="og:image">` |
| **Before** | `og:image` = `https://taopedia.org/og/home.png` |
| **After** | `og:image` = `https://taopedia.org/og/activity_cutoff.png` (first member article) |
| **On-page UI** | Unchanged — 39 article cards, same order as `articles.json` |

Regression checks confirming HTML/JSON parity: `check-allpages-directory.js`, `check-statistics.js`, `check-most-linked.js`, `check-recentchanges-json.js`, `check-category-articles-json.js`.
