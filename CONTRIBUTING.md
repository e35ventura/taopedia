# Contributing To Taopedia

Taopedia uses two repositories:

- Use this repository for website changes: Astro pages, layouts, styling, search, build scripts, and Netlify config.
- Use `taopedia-articles` for article additions, article edits, citations, and MDX content.

Article repo:

https://github.com/e35ventura/taopedia-articles

## Before You Start

Create an issue or pull request for meaningful app changes. Contributor pull requests should target `test`, not `main`. Keep changes focused so reviews are straightforward.

Use Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

For local article sync, place `taopedia-articles` next to this repository or set `TAOPEDIA_ARTICLES_DIR`.

## Pull Request Guidelines

- Keep app changes separate from article/content changes.
- Do not commit generated `src/content/pages` output.
- Run `npm run build` before opening a pull request when code or styling changes.
- Include visual evidence for any UI, layout, styling, responsive, or interaction behavior change.
- Explain any routing, search, or deployment behavior changes in the PR description.

## Visual Evidence Requirements

Visual or interaction PRs must include author-provided evidence in the PR description before review.
A Netlify deploy preview link by itself is not enough.

Include screenshots for static visual changes and a short screen recording or GIF for interaction changes.
For each piece of evidence, include:

- Page URL.
- Viewport width, especially for responsive changes.
- Action taken, for interaction changes.
- Expected before behavior.
- Expected after behavior.

PRs that change UI, layout, styling, responsive behavior, or user interaction without this evidence may be closed and resubmitted with complete review evidence.

## App Areas

- Homepage: `src/pages/index.astro`
- Search: `src/pages/search.astro`
- Article route: `src/pages/wiki/[...slug].astro`
- Shared layout: `src/layouts/WikiLayout.astro`
- Global styling: `src/styles/wikipedia.css`
- Article sync: `scripts/sync-articles.js`
- Link graph and metadata: `scripts/build-linkgraph.js`

## Deployment

Merging to `test` validates changes without updating production. Maintainers promote `test` to `main` with the release workflow when changes are ready. Merging to `main` triggers the Netlify production deploy for this app. Article-only changes should be made in `taopedia-articles`; merged article changes are picked up by the next site rebuild.
