import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';

const width = 1200;
const height = 630;
const logoSvg = fs.readFileSync(path.join(process.cwd(), 'public', 'logo.svg'), 'utf8');
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;

// Layout constants for the card body. The title block, description block, and
// footer share a fixed vertical budget; positions are derived from these so the
// three regions can never overlap regardless of title/description length.
const TITLE_X = 92;
const TITLE_BASELINE = 250;
const TITLE_LINE_HEIGHT = 76;
const TITLE_MAX_LINES = 3;
const TITLE_MAX_CHARS = 24;

const DESC_X = 94;
const DESC_LINE_HEIGHT = 36;
const DESC_MAX_LINES = 3;
const DESC_MAX_CHARS = 58;

const FOOTER_BASELINE = 540;
const FOOTER_GAP = 24; // minimum gap between the last description line and the footer
const TITLE_DESC_GAP = 116; // gap below the last title line at normal density
const MIN_TITLE_DESC_GAP = 44; // tightened gap used when the title is tall

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Break any single word longer than the line budget into hard chunks so an
// unbroken token (e.g. a long URL or identifier) cannot overflow the card.
function splitLongWords(words: string[], maxChars: number) {
  const result: string[] = [];
  for (const word of words) {
    if (word.length <= maxChars) {
      result.push(word);
      continue;
    }
    for (let i = 0; i < word.length; i += maxChars) {
      result.push(word.slice(i, i + maxChars));
    }
  }
  return result;
}

function wrapText(text: string, maxChars: number, maxLines: number) {
  if (maxLines <= 0) return [];
  const words = splitLongWords(text.split(/\s+/).filter(Boolean), maxChars);
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

  if (current && lines.length <= maxLines) lines.push(current);

  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:!?]?$/, '')}…`;
  }

  return lines;
}

interface OgImageOptions {
  title: string;
  description?: string;
  label?: string;
}

// Compute where the description should start and how many lines fit, given the
// rendered title height, so the description never collides with the footer.
function layoutDescription(titleLineCount: number) {
  const lastTitleBaseline = TITLE_BASELINE + (titleLineCount - 1) * TITLE_LINE_HEIGHT;
  const descLimit = FOOTER_BASELINE - FOOTER_GAP; // last allowed description baseline

  let descriptionStart = lastTitleBaseline + TITLE_DESC_GAP;

  // A tall title pushes the normal gap into the footer; tighten the gap so a
  // couple of lines still fit, without crowding the title block.
  if (descriptionStart > descLimit - DESC_LINE_HEIGHT) {
    descriptionStart = Math.max(
      lastTitleBaseline + MIN_TITLE_DESC_GAP,
      descLimit - (DESC_MAX_LINES - 1) * DESC_LINE_HEIGHT
    );
  }

  const availableLines = Math.max(0, Math.floor((descLimit - descriptionStart) / DESC_LINE_HEIGHT) + 1);
  const lineBudget = Math.min(DESC_MAX_LINES, availableLines);

  return { descriptionStart, lineBudget };
}

export function renderOgImage({ title, description, label = 'Bittensor Knowledge Base' }: OgImageOptions) {
  const titleLines = wrapText(title, TITLE_MAX_CHARS, TITLE_MAX_LINES);
  const { descriptionStart, lineBudget } = layoutDescription(titleLines.length);
  const descriptionLines = description && lineBudget > 0 ? wrapText(description, DESC_MAX_CHARS, lineBudget) : [];

  const titleSvg = titleLines
    .map(
      (line, index) =>
        `<text x="${TITLE_X}" y="${TITLE_BASELINE + index * TITLE_LINE_HEIGHT}" font-family="Georgia, 'Times New Roman', serif" font-size="68" font-weight="700" fill="#202122">${escapeHtml(line)}</text>`
    )
    .join('');

  const descriptionSvg = descriptionLines
    .map(
      (line, index) =>
        `<text x="${DESC_X}" y="${descriptionStart + index * DESC_LINE_HEIGHT}" font-family="Arial, sans-serif" font-size="27" font-weight="400" fill="#54595d">${escapeHtml(line)}</text>`
    )
    .join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#f8f9fa"/>
  <rect x="40" y="40" width="1120" height="550" fill="#ffffff" stroke="#a2a9b1" stroke-width="2"/>
  <rect x="40" y="40" width="1120" height="10" fill="#36c"/>
  <image href="${logoDataUri}" x="92" y="76" width="78" height="84" preserveAspectRatio="xMinYMin meet"/>
  <text x="190" y="120" font-family="Georgia, 'Times New Roman', serif" font-size="48" font-weight="700" fill="#202122">TAOPEDIA</text>
  <text x="192" y="160" font-family="Arial, sans-serif" font-size="24" font-weight="500" fill="#54595d">${escapeHtml(label)}</text>
  <line x1="92" y1="194" x2="1108" y2="194" stroke="#a2a9b1" stroke-width="2"/>
  ${titleSvg}
  ${descriptionSvg}
  <text x="94" y="${FOOTER_BASELINE}" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#36c">taopedia.org</text>
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
