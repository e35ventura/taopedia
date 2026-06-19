# Contributing To Taopedia

Taopedia is split across two repositories:

- Use this repository for website changes: Astro pages, layouts, styling, search, build scripts, metadata, and deployment config.
- Use `taopedia-articles` for article additions, article edits, citations, and MDX content: https://github.com/e35ventura/taopedia-articles

## Before You Start

Contributor pull requests should target `test`, not `main`.

Keep PRs focused. The maintainer should be able to tell what changed, why it helps Taopedia, and whether the change is worth carrying long term without having to infer the intent from the diff.

Use Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

For local article sync, place `taopedia-articles` next to this repository or set `TAOPEDIA_ARTICLES_DIR`.

## Maintainer Expectations

A good PR is concrete and reviewable. It should make the Taopedia-specific benefit clear, especially when it adds code, tests, routes, dependencies, metadata, headers, workflows, or other maintenance surface.

Small fixes and focused features are easier to review than broad cleanup. Generic best-practice churn, speculative hardening, cosmetic rewrites, or extra tests without a clear Taopedia problem are unlikely to be accepted.

Call out behavior that matters for review: routes, search, metadata, build output, deployment, security, article sync, or generated data. If a change has a useful validation step, mention it. Some changes, such as docs-only edits, may not need a test.

Do not mix app changes with article/content changes. Do not commit generated `src/content/pages` output.

Use existing CSS custom properties for colors, backgrounds, borders, and themed UI states. Do not hardcode light-only or dark-only colors unless the change is intentionally adding a new theme token.

## Visual Changes

If a PR creates or changes anything visible, include visual evidence in the PR description before review.

This includes new pages, visible components, navigation links, layout changes, styling changes, responsive changes, and interaction changes. A new page is still a visual change. A deploy preview link alone is not enough.

For visual changes, include before and after screenshots for the affected surface. For a new page, use the closest existing page, index, navigation area, or missing-route state as the before screenshot, then show the new page as the after screenshot.

For interaction changes, include a short video/GIF or screenshots that clearly show the before and after behavior.

Good visual evidence includes the page URL, viewport width, what changed, and what the reviewer should compare. Light/Dark screenshots can be helpful, but they do not replace before/after evidence.

PRs that add or change visible UI without useful before/after evidence may be closed and resubmitted with complete evidence.

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
