import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';

// Render the square PNG app icons referenced by site.webmanifest. The brand logo
// (public/logo.svg) is embedded as a data URI and centered on the white brand
// background — the same Resvg approach used for OG images (src/lib/og-image.ts),
// so there is no new dependency and the icons stay in sync with the logo.
//
// `maskable` insets the logo into the central safe zone so platform icon masking
// (circle / squircle / rounded-rect) never clips it.
const logoSvg = fs.readFileSync(path.join(process.cwd(), 'public', 'logo.svg'), 'utf8');
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;

export function renderPwaIcon(size, { maskable = false } = {}) {
  const insetRatio = maskable ? 0.18 : 0.12; // padding per side (maskable keeps the logo inside the safe zone)
  const pad = Math.round(size * insetRatio);
  const inner = size - pad * 2;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#ffffff"/>
  <image href="${logoDataUri}" x="${pad}" y="${pad}" width="${inner}" height="${inner}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}
