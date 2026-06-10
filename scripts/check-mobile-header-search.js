import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const styles = fs.readFileSync(path.join(projectRoot, 'src', 'styles', 'wikipedia.css'), 'utf8');

const assertMobileRuleAfter = (afterMarker, rulePattern, message) => {
  const markerIndex = styles.indexOf(afterMarker);
  assert.notEqual(markerIndex, -1, `missing cascade marker: ${afterMarker}`);
  assert.match(styles.slice(markerIndex), rulePattern, message);
};

assert.match(
  styles,
  /@media\s*\(max-width:\s*640px\)\s*{[\s\S]*?\.mw-header\s*{[\s\S]*?height:\s*98px;/,
  'mobile wiki header must reserve enough height for a full-width search row',
);

assert.match(
  styles,
  /@media\s*\(max-width:\s*640px\)\s*{[\s\S]*?\.mw-header-content\s*{[\s\S]*?flex-wrap:\s*wrap;/,
  'mobile wiki header content must wrap instead of squeezing search into one row',
);

assert.match(
  styles,
  /@media\s*\(max-width:\s*640px\)\s*{[\s\S]*?\.mw-header-center\s*{[\s\S]*?flex:\s*0 0 100%;/,
  'mobile search area must take a full header row',
);

assertMobileRuleAfter(
  '.mw-page-container {\n  margin-top: 50px;',
  /@media\s*\(max-width:\s*640px\)\s*{[\s\S]*?\.mw-page-container\s*{[\s\S]*?margin-top:\s*98px;/,
  'mobile content offset must appear after the base page margin so it wins the cascade',
);

assertMobileRuleAfter(
  '.mw-sidebar.mobile-active {\n  position: fixed !important;',
  /@media\s*\(max-width:\s*640px\)\s*{[\s\S]*?\.mw-sidebar,\s*[\s\S]*?\.mw-sidebar\.mobile-active\s*{[\s\S]*?top:\s*98px;/,
  'mobile sidebar offset must appear after the mobile-active base top so it wins the cascade',
);

assertMobileRuleAfter(
  '.mw-search-container {\n  flex: 1;',
  /@media\s*\(max-width:\s*640px\)\s*{[\s\S]*?\.mw-search-container\s*{[\s\S]*?max-width:\s*none;/,
  'mobile search container must not keep the desktop max-width constraint after the base rule',
);

console.log('Mobile header search check passed');
