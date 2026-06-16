// Pure text helpers for the OG-image card. These live in their own module so
// they can be unit-tested in isolation: og-image.ts imports the native Resvg
// renderer and reads logo.svg at import time, which a plain Node test harness
// (scripts/check-*.js) cannot load. The behaviour here is unchanged — these are
// the same helpers, just relocated to a testable boundary.

// "Subnet 12: Compute Horde" reads as a long, easily-clipped title on a share
// card. Parse the netuid so the card can surface it as a distinct badge and use
// the subnet name as the title instead. Returns null for non-subnet titles and
// for a bare "Subnet 86" (no name), which render as a normal title.
export function parseSubnet(title) {
  const match = /^Subnet (\d+)(?::\s*(.+))?$/.exec(title ?? '');
  if (match && match[2] && match[2].trim()) {
    return { netuid: Number(match[1]), name: match[2].trim() };
  }
  return null;
}

export function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Break any single word longer than the line budget into hard chunks so an
// unbroken token (e.g. a long URL or identifier) cannot overflow the card.
export function splitLongWords(words, maxChars) {
  const result = [];
  for (const word of words) {
    if (word.length <= maxChars) {
      result.push(word);
      continue;
    }
    // Iterate codepoints (for...of never splits a surrogate pair) but
    // accumulate by UTF-16 length against maxChars, preserving the
    // original width budget per chunk -- a chunk stops *before* a
    // codepoint that would push it over maxChars, instead of slicing
    // mid-surrogate.
    let chunk = '';
    for (const ch of word) {
      if (chunk.length + ch.length > maxChars && chunk) {
        result.push(chunk);
        chunk = '';
      }
      chunk += ch;
    }
    if (chunk) result.push(chunk);
  }
  return result;
}

// Wrap text to at most `maxLines` lines of at most `maxChars` characters. When
// the text doesn't fit, the last rendered line is truncated with an ellipsis.
export function wrapText(text, maxChars, maxLines) {
  if (maxLines <= 0) return [];
  const words = splitLongWords(text.split(/\s+/).filter(Boolean), maxChars);
  const lines = [];
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
    const stripped = lines[maxLines - 1].replace(/[.,;:!?]?$/, '');
    // If the line is already at the character budget, the ellipsis itself
    // would push it one character over -- trim from the end until there's
    // room. Trim by codepoint (Array.from), not UTF-16 unit: a plain slice
    // can land inside a surrogate pair (astral emoji), producing the same
    // lone-surrogate corruption splitLongWords was fixed to avoid.
    let truncated = stripped;
    if (truncated.length >= maxChars) {
      const codepoints = Array.from(truncated);
      while (codepoints.length > 0 && codepoints.join('').length >= maxChars) {
        codepoints.pop();
      }
      truncated = codepoints.join('');
    }
    lines[maxLines - 1] = `${truncated}…`;
  }

  return lines;
}
