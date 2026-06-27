import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Accessible-name guard for the article toolbar's appearance toggle (the "Aa"
// button that shows/hides the Appearance panel).
//
// The button is a disclosure control: its JS keeps aria-expanded in sync with
// whether the panel is shown (WikiLayout.astro). Per WCAG 4.1.2 (Name, Role, Value)
// and the WAI-ARIA disclosure pattern, the accessible NAME of such a toggle must be
// state-neutral and let aria-expanded convey open/closed — exactly how the sibling
// `.sidebar-toggle` uses "Toggle navigation". A stateful name like "Show appearance
// controls" contradicts the control once aria-expanded is "true" (a screen reader
// then announces "Show appearance controls, expanded" — a name that promises a "show"
// action while the state says it is already open), and the markup never rewrites the
// label, so the contradiction ships on every article page. This check fails the build
// if any appearance toggle regresses to a stateful "Show"/"Hide" name, or carries an
// empty name or an invalid aria-expanded value.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
assert.ok(fs.existsSync(distDir), 'dist/ not found; run the build first');

function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

// Match each appearance-toggle <button ...> opening tag and pull its attributes,
// tolerant of attribute order (aria-label/aria-expanded may appear either side of the
// class) so the check does not depend on the exact attribute sequence in the template.
const TOGGLE_TAG = /<button[^>]*\bclass="[^"]*\bappearance-toggle\b[^"]*"[^>]*>/gi;
const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag);
  return m ? m[1] : null;
};

const htmlFiles = walkHtml(distDir);
let toggleCount = 0;

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(distDir, file);
  for (const match of html.matchAll(TOGGLE_TAG)) {
    toggleCount += 1;
    const tag = match[0];
    const label = attr(tag, 'aria-label');
    const expanded = attr(tag, 'aria-expanded');

    assert.ok(
      label && label.trim().length > 0,
      `${rel}: appearance toggle must have a non-empty aria-label (got ${JSON.stringify(label)})`,
    );
    // The defect this guards: a stateful "Show"/"Hide" name on a control whose
    // aria-expanded toggles. The name must be state-neutral (e.g. "Toggle appearance
    // controls") so it can never contradict the announced expanded state.
    assert.ok(
      !/^\s*(show|hide)\b/i.test(label),
      `${rel}: appearance toggle aria-label must be state-neutral, not a stateful "Show"/"Hide" name that contradicts aria-expanded (got ${JSON.stringify(label)})`,
    );
    assert.ok(
      expanded === 'true' || expanded === 'false',
      `${rel}: appearance toggle must carry a valid aria-expanded ("true"/"false") for the disclosure pattern (got ${JSON.stringify(expanded)})`,
    );
  }
}

// Guard against the selector silently matching nothing (e.g. a markup/class rename):
// the article pages render this toggle, so a zero count means the check went blind.
assert.ok(
  toggleCount > 0,
  'no appearance-toggle buttons found in dist/ — the accessible-name check matched nothing (markup or class renamed?)',
);

console.log(
  `Appearance-toggle a11y check passed (${toggleCount} appearance toggles across ${htmlFiles.length} built pages carry a state-neutral accessible name and a valid aria-expanded)`,
);
