# Taopedia

A Bittensor knowledge base built with **Astro**, **MDX articles**, and **Netlify**. The application lives in this repository, while public article contributions live in [`taopedia-articles`](https://github.com/e35ventura/taopedia-articles).

**Live site:** https://taopedia.org

## 🎯 Features

- ✅ **Exact Wikipedia styling** - Vector 2022 skin replication
- ✅ **MDX-based content** - Articles are synced from `e35ventura/taopedia-articles`
- ✅ **Git-powered revisions** - Full history tracked automatically via Git
- ✅ **[[Wiki Links]]** - Internal link syntax with automatic resolution
- ✅ **Static site generation** - Pre-rendered pages for maximum speed
- ✅ **Pagefind search** - Fast client-side search built at deploy time
- ✅ **No runtime GitHub API** - All data generated at build time
- ✅ **Backlinks** - Automatic "What links here" for every page
- ✅ **Categories** - Organize articles with frontmatter categories
- ✅ **Table of contents** - Auto-generated from headings
- ✅ **Mobile responsive** - Works on all devices

## 🏗️ Architecture

### Content Model

Articles are authored in the companion article repository and synced into this app at build time:

```
../taopedia-articles/content/pages/{slug}/index.mdx
```

Example:
```markdown
---
title: Gravity
categories: ["Physics", "Science"]
summary: A fundamental interaction between objects with mass.
featured: true
---

**Gravity** is a fundamental force...

See also [[Isaac Newton]] and [[Albert Einstein]].
```

### Build Pipeline

1. **Article Sync** - `scripts/sync-articles.js` copies Bittensor-focused MDX articles from `taopedia-articles`
2. **Git History Extraction** - `scripts/generate-history.js` builds revision JSON
3. **Link Graph** - `scripts/build-linkgraph.js` parses `[[Wiki Links]]` and generates backlinks
4. **Astro Build** - Static site generation with MDX rendering
5. **Pagefind** - Search index generation from built HTML

### No Runtime Dependencies

- **No GitHub API calls** at runtime
- **No database queries** - all data baked into static files
- **No server** - pure static HTML/CSS/JS

## 📁 Project Structure

```
taopedia/
├── src/
│   ├── content/
│   │   ├── config.ts              # Content collections schema
│   │   └── pages/
│   │       ├── gravity/index.md   # Example article
│   │       ├── isaac_newton/index.md
│   │       └── ...
│   ├── layouts/
│   │   └── WikiLayout.astro       # Main Wikipedia layout
│   ├── pages/
│   │   ├── index.astro            # Homepage
│   │   ├── search.astro           # Search page
│   │   └── wiki/
│   │       ├── [...slug].astro    # Article pages
│   │       └── [...slug]/history.astro  # History pages
│   └── styles/
│       └── wikipedia.css          # Vector 2022 skin CSS
├── scripts/
│   ├── generate-history.js        # Extract Git history
│   └── build-linkgraph.js         # Build backlinks & categories
├── public/
│   ├── data/                      # Generated at build (linkgraph, backlinks, etc.)
│   └── history/                   # Generated at build (revision history)
├── astro.config.mjs
├── netlify.toml
└── package.json
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Git

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Visit http://localhost:4321

### Build

```bash
npm run build
```

This will:
1. Extract Git history for each article → `public/history/{slug}.json`
2. Build link graph and backlinks → `public/data/*.json`
3. Build Astro static site → `dist/`
4. Generate Pagefind search index → `dist/pagefind/`

### Preview Production Build

```bash
npm run preview
```

## ✍️ Contributing

### Adding a New Article

1. Create a new directory under `src/content/pages/`:

```bash
mkdir -p src/content/pages/quantum_mechanics
```

2. Create `index.md`:

```markdown
---
title: Quantum Mechanics
categories: ["Physics", "Science"]
summary: The fundamental theory in physics describing nature at atomic scales.
---

**Quantum mechanics** is a fundamental theory...

See [[Physics]] and [[Albert Einstein]].
```

3. Commit and push:

```bash
git add src/content/pages/quantum_mechanics
git commit -m "Add Quantum Mechanics article"
git push origin main
```

4. Netlify will automatically rebuild and deploy.

### Editing an Existing Article

1. Edit the Markdown file directly in your editor or on GitHub
2. Commit and push (or open a Pull Request)
3. Once merged to `main`, Netlify redeploys

### Internal Links

Use Wikipedia-style `[[Wiki Links]]`:

```markdown
See [[Isaac Newton]] for more details.
```

This will automatically resolve to `/wiki/isaac_newton` and create a backlink.

### Categories

Add categories in frontmatter:

```yaml
---
categories: ["Physics", "Biography", "Science"]
---
```

Categories will appear at the bottom of the article and in the category index.

## 🔍 Search

Search is powered by [Pagefind](https://pagefind.app/), a static search library. The search index is built during `npm run build` and includes:

- Article titles (boosted)
- Article body content
- Frontmatter metadata

## 📖 Git History & Revisions

Every article's edit history comes from Git:

- **View history:** `/wiki/{slug}/history`
- **See who edited:** Git commit author
- **See when:** Git commit timestamp
- **See what changed:** Link to GitHub commit diff

The build script (`scripts/generate-history.js`) runs `git log --follow` on each article to extract this data.

## 🎨 Wikipedia Styling

The site replicates Wikipedia's **Vector 2022 skin**:

- Typography: Linux Libertine (serif headings), system sans-serif (body)
- Colors: Exact Wikipedia color palette
- Layout: Fixed sidebar, max-width content, sticky TOC
- Components: Infoboxes, category links, article tabs

All styling is in `src/styles/wikipedia.css`.

## 🚀 Deployment

### Netlify (Recommended)

1. Connect your GitHub repo to Netlify
2. Build command: `git fetch --unshallow || true && npm run build`
3. Publish directory: `dist`
4. Deploy!

The `netlify.toml` is already configured.

### Other Hosts

Any static host works (Vercel, Cloudflare Pages, GitHub Pages):

```bash
npm run build
# Upload dist/ to your host
```

## 🛠️ Customization

### Change Site Name/Branding

Edit `src/layouts/WikiLayout.astro`:

```astro
<a href="/" class="mw-logo">
  Taopedia
</a>
```

### Add Custom Components

Create Astro components in `src/components/` and import them in articles:

```markdown
---
title: My Article
---

import Infobox from '../../components/Infobox.astro';

<Infobox title="Example" />
```

### Modify Styling

Edit `src/styles/wikipedia.css` to change colors, fonts, or layout.

## 📝 Roadmap / Future Features

- [ ] Talk pages (via Supabase)
- [ ] User authentication (Supabase Auth)
- [ ] In-app Markdown editor (creates PRs via GitHub API)
- [ ] Page protection and moderation
- [ ] Watchlists
- [ ] Recent changes feed with live updates
- [ ] Templates and transclusion
- [ ] File uploads (images, PDFs)
- [ ] Multilingual support

## 📜 License

Content: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)  
Code: MIT

## 🙏 Acknowledgments

- Design inspired by [Wikipedia](https://www.wikipedia.org/) and the Vector 2022 skin
- Search powered by [Pagefind](https://pagefind.app/)
- Built with [Astro](https://astro.build/)
- Hosted on [Netlify](https://www.netlify.com/)

---

**Questions?** Open an issue on GitHub or contribute via Pull Request!
