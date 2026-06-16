import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';
import { escapeHtml, wrapText, parseSubnet } from './og-text.js';

const width = 1200;
const height = 630;
const logoSvg = fs.readFileSync(path.join(process.cwd(), 'public', 'logo.svg'), 'utf8');
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;

// Site palette (src/styles/wikipedia.css tokens) so the card reads as Taopedia,
// not a generic SEO card.
const COLOR_BASE = '#202122';
const COLOR_SUBTLE = '#54595d';
const COLOR_LINK = '#3366cc';
const COLOR_CARD = '#ffffff';
const COLOR_PAGE = '#f8f9fa';
const COLOR_BORDER = '#a2a9b1';
const COLOR_CHIP_BORDER = '#c8ccd1';
const FONT_SERIF = "'Linux Libertine', Georgia, 'Times New Roman', serif";
const FONT_SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

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
const FOOTER_GAP = 40; // comfortable gap between the last description line and the footer
const TITLE_DESC_GAP = 116; // gap below the last title line at normal density
const MIN_TITLE_DESC_GAP = 44; // tightened gap used when the title is tall

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

// A bordered "chip" like the site's topic pills. Width is estimated from the
// text length (left-aligned, so a small estimate error only loosens the box).
// Subnet badges use the accent fill so subnet cards are instantly recognizable.
function renderChip(text: string, x: number, y: number, accent: boolean) {
  const fontSize = 23;
  const padX = 15;
  const chipHeight = 38;
  const chipWidth = Math.round(text.length * 12.2) + padX * 2;
  const fill = accent ? COLOR_LINK : COLOR_PAGE;
  const stroke = accent ? COLOR_LINK : COLOR_CHIP_BORDER;
  const textFill = accent ? '#ffffff' : COLOR_SUBTLE;
  return `<rect x="${x}" y="${y}" width="${chipWidth}" height="${chipHeight}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
  <text x="${x + padX}" y="${y + 26}" font-family="${FONT_SANS}" font-size="${fontSize}" font-weight="600" fill="${textFill}">${escapeHtml(text)}</text>`;
}

export function renderOgImage({ title, description, label = 'Bittensor Knowledge Base' }: OgImageOptions) {
  const subnet = parseSubnet(title);
  const displayTitle = subnet ? subnet.name : title;
  // The eyebrow chip: a subnet netuid badge, else the article's topic. Skipped
  // when it would just repeat the title (e.g. the homepage).
  const chipText = subnet ? `Subnet ${subnet.netuid}` : label;
  const showChip = !!chipText && chipText !== displayTitle;

  const titleLines = wrapText(displayTitle, TITLE_MAX_CHARS, TITLE_MAX_LINES);
  const { descriptionStart, lineBudget } = layoutDescription(titleLines.length);
  const descriptionLines = description && lineBudget > 0 ? wrapText(description, DESC_MAX_CHARS, lineBudget) : [];

  const titleSvg = titleLines
    .map(
      (line, index) =>
        `<text x="${TITLE_X}" y="${TITLE_BASELINE + index * TITLE_LINE_HEIGHT}" font-family="${FONT_SERIF}" font-size="68" font-weight="700" fill="${COLOR_BASE}">${escapeHtml(line)}</text>`
    )
    .join('');

  const descriptionSvg = descriptionLines
    .map(
      (line, index) =>
        `<text x="${DESC_X}" y="${descriptionStart + index * DESC_LINE_HEIGHT}" font-family="${FONT_SANS}" font-size="27" font-weight="400" fill="${COLOR_SUBTLE}">${escapeHtml(line)}</text>`
    )
    .join('');

  const chipSvg = showChip ? renderChip(chipText, 192, 132, !!subnet) : '';
  // The footer tagline is a brand element on article/subnet cards; suppress it on
  // the homepage card, where the title is already "Bittensor Knowledge Base".
  const TAGLINE = 'Bittensor Knowledge Base';
  const taglineSvg =
    displayTitle === TAGLINE
      ? ''
      : `<text x="1108" y="${FOOTER_BASELINE}" text-anchor="end" font-family="${FONT_SANS}" font-size="22" font-weight="400" fill="${COLOR_SUBTLE}">${TAGLINE}</text>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${COLOR_PAGE}"/>
  <rect x="40" y="40" width="1120" height="550" fill="${COLOR_CARD}" stroke="${COLOR_BORDER}" stroke-width="2"/>
  <rect x="40" y="40" width="1120" height="10" fill="${COLOR_LINK}"/>
  <image href="${logoDataUri}" x="92" y="74" width="74" height="80" preserveAspectRatio="xMinYMin meet"/>
  <text x="190" y="118" font-family="${FONT_SERIF}" font-size="46" font-weight="700" fill="${COLOR_BASE}">TAOPEDIA</text>
  ${chipSvg}
  <line x1="92" y1="196" x2="1108" y2="196" stroke="${COLOR_CHIP_BORDER}" stroke-width="2"/>
  ${titleSvg}
  ${descriptionSvg}
  <text x="94" y="${FOOTER_BASELINE}" font-family="${FONT_SANS}" font-size="24" font-weight="700" fill="${COLOR_LINK}">taopedia.org</text>
  ${taglineSvg}
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
