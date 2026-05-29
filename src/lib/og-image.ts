import { Resvg } from '@resvg/resvg-js';

const width = 1200;
const height = 630;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapText(text: string, maxChars: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:!?]?$/, '')}...`;
  }

  return lines;
}

interface OgImageOptions {
  title: string;
  description?: string;
  label?: string;
}

export function renderOgImage({ title, description, label = 'Bittensor Knowledge Base' }: OgImageOptions) {
  const titleLines = wrapText(title, 24, 3);
  const descriptionLines = description ? wrapText(description, 58, 3) : [];

  const titleSvg = titleLines
    .map(
      (line, index) =>
        `<text x="92" y="${250 + index * 76}" font-family="Georgia, 'Times New Roman', serif" font-size="68" font-weight="700" fill="#202122">${escapeHtml(line)}</text>`
    )
    .join('');

  const descriptionStart = 290 + titleLines.length * 76;
  const descriptionSvg = descriptionLines
    .map(
      (line, index) =>
        `<text x="94" y="${descriptionStart + index * 36}" font-family="Arial, sans-serif" font-size="27" font-weight="400" fill="#54595d">${escapeHtml(line)}</text>`
    )
    .join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#f8f9fa"/>
  <rect x="40" y="40" width="1120" height="550" fill="#ffffff" stroke="#a2a9b1" stroke-width="2"/>
  <rect x="40" y="40" width="1120" height="10" fill="#36c"/>
  <g transform="translate(94 78) scale(0.72)">
    <path d="M44.8 81.3V30.8C44.8 17.9 34.6 7.8 21.8 7.8V89C21.8 100.8 30.9 111 42.7 111.7C48.8 112 54.5 110.4 59.1 107.4C47 106.3 44.8 99.7 44.8 81.3Z" fill="#202122"/>
    <path d="M17.8 0C8 0 0 8 0 17.8H89.6C99.4 17.8 107.4 9.8 107.4 0H17.8Z" fill="#202122"/>
  </g>
  <text x="188" y="120" font-family="Georgia, 'Times New Roman', serif" font-size="48" font-weight="700" fill="#202122">TAOPEDIA</text>
  <text x="190" y="160" font-family="Arial, sans-serif" font-size="24" font-weight="500" fill="#54595d">${escapeHtml(label)}</text>
  <line x1="92" y1="194" x2="1108" y2="194" stroke="#a2a9b1" stroke-width="2"/>
  ${titleSvg}
  ${descriptionSvg}
  <text x="94" y="540" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#36c">taopedia.org</text>
</svg>`;

  return new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: width,
    },
  })
    .render()
    .asPng();
}
