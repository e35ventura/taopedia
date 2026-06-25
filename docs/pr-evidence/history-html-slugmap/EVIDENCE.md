# Visual evidence: history HTML slugmap + share-preview PR

## Per-article History page (`/wiki/<slug>/history/`)

Example: `/wiki/dynamic_tao/history/`

| Field | Value |
|-------|-------|
| **Page URL** | `/wiki/dynamic_tao/history/` |
| **Viewport** | 1280px desktop |
| **Action** | Load revision history list; inspect page title and `og:image` meta |
| **Before** | Title from `page.data.title` via `getCollection`; `og:image` defaulted to `/og/home.png` |
| **After** | Title from `publishedTitleBySlug()` (slugmap artifact, same as `history.json`); `og:image` = `/og/dynamic_tao.png` |
| **On-page UI** | Unchanged — same revision rows, dates, authors, commit messages (`check-history-json.js` parity) |

## Regression

- `npm run build` → `check-history-json.js` (350 articles, HTML/JSON parity)
- `check-cite-json.js` / history HTML discovery paths unchanged
