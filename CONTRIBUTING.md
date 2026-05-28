# Contributing To Taopedia

Taopedia uses two repositories:

- Use this repository for website changes: Astro pages, layouts, styling, search, build scripts, and Netlify config.
- Use `taopedia-articles` for article additions, article edits, citations, and MDX content.

Article repo:

https://github.com/e35ventura/taopedia-articles

## Before You Start

Create an issue or pull request for meaningful app changes. Keep changes focused so reviews are straightforward.

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
- Include screenshots for visible UI changes.
- Explain any routing, search, or deployment behavior changes in the PR description.

## App Areas

- Homepage: `src/pages/index.astro`
- Search: `src/pages/search.astro`
- Article route: `src/pages/wiki/[...slug].astro`
- Shared layout: `src/layouts/WikiLayout.astro`
- Global styling: `src/styles/wikipedia.css`
- Article sync: `scripts/sync-articles.js`
- Link graph and metadata: `scripts/build-linkgraph.js`

## Deployment

Merging to `main` triggers the Netlify production deploy for this app. Article-only changes should be made in `taopedia-articles`; merged article changes are picked up by the next site rebuild.
