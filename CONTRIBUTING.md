# Contributing To Taopedia

Taopedia is split across two repositories:

- Use this repository for website changes: Astro pages, layouts, styling, search, build scripts, metadata, and deployment config.
- Use `taopedia-articles` for article additions, article edits, citations, and MDX content: https://github.com/e35ventura/taopedia-articles

## Before You Start

Contributors should target pull requests at `test`, not `main`.

Keep PRs focused. A good PR should be easy to describe in one sentence, easy to review from the diff, and useful enough that Taopedia should carry the added code or maintenance surface long term.

Use Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

For local article sync, place `taopedia-articles` next to this repository or set `TAOPEDIA_ARTICLES_DIR`.

## What To Include In A PR

Every PR should explain:

- What changed.
- Why the change is useful for Taopedia.
- How you checked it, or why no validation was needed.
- Any route, search, metadata, build, or deployment behavior affected by the change.

Do not mix app changes with article/content changes. Do not commit generated `src/content/pages` output.

Run `npm run build` before opening a PR when code, routes, metadata, styling, or build behavior changes.

Use existing CSS custom properties for colors, backgrounds, borders, and themed UI states. Do not hardcode light-only or dark-only colors unless the PR is intentionally adding a new theme token.

## Visual Changes

If a PR creates or changes anything visible, include visual evidence in the PR description before review.

This includes new pages, new visible components, navigation links, layout changes, styling changes, responsive changes, and interaction changes. A new page is still a visual change. A deploy preview link alone is not enough.

For visual changes, include before and after screenshots for the affected surface. For a new page, use the closest existing page, index, navigation area, or missing-route state as the before screenshot, then show the new page as the after screenshot.

For interaction changes, include a short video/GIF or screenshots that clearly show the before and after behavior.

Good visual evidence includes the page URL, viewport width, what changed, and what the reviewer should compare. Light/Dark screenshots can be helpful, but they do not replace before/after evidence.

PRs that add or change visible UI without useful before/after evidence may be closed and resubmitted with complete evidence.

## Review Expectations

Taopedia prefers small, concrete improvements over broad cleanup or generic best-practice churn. Passing CI is required, but it is not enough by itself.

PRs may be closed when the benefit is unclear, the change is too broad, the testing is weak, the PR adds low-value maintenance surface, or the visual evidence is missing.

## App Areas

- Homepage: `src/pages/index.astro`
- Search: `src/pages/search.astro`
- Article route: `src/pages/wiki/[...slug].astro`
- Shared layout: `src/layouts/WikiLayout.astro`
- Global styling: `src/styles/wikipedia.css`
- Article sync: `scripts/sync-articles.js`
- Link graph and metadata: `scripts/build-linkgraph.js`

## Deployment

Merging to `test` validates changes without updating production. Maintainers promote `test` to `main` with the release workflow when changes are ready. Merging to `main` triggers the Netlify production deploy for this app.
