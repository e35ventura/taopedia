# Wiki feature module

A small, reusable module that encapsulates layouts and components for Taopedia wiki pages (articles, categories, specials).

## Structure

- `src/features/wiki/layouts/BaseLayout.astro`
  - Provides header, sidebar slot, main body, right rail, footer, overlays, and client behavior for:
    - Sidebar toggle and overlay
    - Right-rail (Appearance) toggle and overlay
    - TOC hide button behavior
    - Appearance persistence for text size and content width
  - Renders the right-rail via `AppearancePanel` component.

- `src/features/wiki/layouts/ArticleLayout.astro`
  - Thin wrapper around `BaseLayout` for article pages.

- `src/features/wiki/layouts/CategoryLayout.astro`
  - Thin wrapper around `BaseLayout` for category/special listing pages.

- `src/features/wiki/components/AppearancePanel.astro`
  - The right-rail Appearance panel (Text, Width, Color radios). No JS here; behavior is in `BaseLayout`.

- `src/features/wiki/components/TocSidebar.astro`
  - Reusable Table of Contents sidebar. Accepts a `headings` array `[{ depth, slug, text }]`.

- `src/features/wiki/components/ArticleToolbar.astro`
  - Article toolbar with links for Article, History, Edit, and optional What links here.

## Usage examples

### Article page
```astro
---
import ArticleLayout from "@/features/wiki/layouts/ArticleLayout.astro";
import TocSidebar from "@/features/wiki/components/TocSidebar.astro";
import ArticleToolbar from "@/features/wiki/components/ArticleToolbar.astro";
// ...your server code to load `page`, `headings`, `slug`, etc.
---

<ArticleLayout title={page.data.title} description={page.data.summary}>
  {headings.length > 1 && (
    <TocSidebar slot="sidebar" headings={headings} />
  )}

  <h1 class="firstHeading">{page.data.title}</h1>
  <ArticleToolbar slug={slug} historyUrl={historyUrl} editUrl={editUrl} />

  <div class="mw-parser-output">
    <Content />
  </div>
</ArticleLayout>
```

### Categories/Special page
```astro
---
import CategoryLayout from "@/features/wiki/layouts/CategoryLayout.astro";
// ...your server code to build the categories list
---

<CategoryLayout title="Categories">
  <div slot="sidebar" class="toc-sidebar">
    <!-- any simple static nav for specials -->
  </div>

  <nav class="mw-article-toolbar">
    <button class="sidebar-toggle toolbar-toggle" aria-label="Toggle navigation">☰</button>
    <a href="#" class="active">Special page</a>
    <span class="toolbar-spacer"></span>
    <button class="right-rail-toggle toolbar-toggle" aria-label="Toggle appearance settings">⚙</button>
  </nav>

  <h1 class="firstHeading">Categories</h1>
  <div class="mw-parser-output">
    <!-- categories list -->
  </div>
</CategoryLayout>
```

## Notes
- All classes and selectors mirror the current `WikiLayout.astro` so existing CSS (`src/styles/wikipedia.css`) and behaviors should work unchanged.
- The appearance persistence (text/width) uses `localStorage` keys: `taopedia-text-size`, `taopedia-width`.

## Next steps (optional)
- Refactor `src/pages/wiki/[...slug].astro` and `src/pages/wiki/Special/Categories.astro` to use `ArticleLayout`/`CategoryLayout` and components.
- Extract inline styles into CSS where appropriate.
- Implement Color theme switching if desired.
