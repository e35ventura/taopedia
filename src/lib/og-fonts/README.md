# OG card fonts

These fonts are bundled so the generated OG share cards (`src/lib/og-image.ts`)
render in the Taopedia brand fonts on every build host. resvg renders with the
build server's installed fonts, which do not include the site's serif (Linux
Libertine) or `Inter`, so without bundling them the cards silently fall back to
whatever generic fonts the host has and look off-brand versus the live site.

They are **server-only** (read by resvg at build time); they are not served as
web fonts and are not referenced from any page CSS.

| File | Family / weight | Used for | Source | License |
|------|-----------------|----------|--------|---------|
| `LibertinusSerif-Bold.otf` | Libertinus Serif, 700 | wordmark + title (the `--font-family-serif` brand serif, the OFL build of Linux Libertine) | [Libertinus 7.051](https://github.com/alerque/libertinus) | OFL-1.1 (`OFL.txt`) |
| `Inter-Regular.otf` | Inter, 400 | description, footer tagline | [Inter 4.1](https://github.com/rsms/inter) | OFL-1.1 (`Inter-OFL.txt`) |
| `Inter-SemiBold.otf` | Inter, 600 | eyebrow chip | Inter 4.1 | OFL-1.1 |
| `Inter-Bold.otf` | Inter, 700 | footer link | Inter 4.1 | OFL-1.1 |

All four are **subset to Latin + common punctuation/symbols** (via `fonttools`)
to keep them small (~244 KB total). `loadSystemFonts` stays enabled in the
renderer so any glyph outside the subset still falls back to a host font rather
than rendering as tofu.
