# Visual evidence: backlinks HTML slugmap + share-preview PR

## Per-article What links here page (`/wiki/<slug>/backlinks/`)

Example: `/wiki/dynamic_tao/backlinks/`

| Field | Value |
|-------|-------|
| **Page URL** | `/wiki/dynamic_tao/backlinks/` |
| **Viewport** | 1280px desktop |
| **Action** | Load inbound-link list; inspect page title, link labels, and `og:image` meta |
| **Before** | Title from `page.data.title` via `getCollection`; `og:image` defaulted to `/og/home.png` |
| **After** | Title from `publishedTitleBySlug()` (slugmap artifact, same as `backlinks.json`); `og:image` = `/og/dynamic_tao.png` |
| **On-page UI** | Unchanged — same sorted inbound-link list and empty state (`check-backlinks-page.js` parity) |

## Regression

- `npm run build` → `check-backlinks-page.js` (350 articles, HTML/backlinks.json parity)
- `check-backlinks-json.js` unchanged — JSON companion still uses slugmap titles
