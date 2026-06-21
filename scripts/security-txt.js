// Build an RFC 9116 security.txt exposing the repository's existing
// SECURITY.md disclosure policy at the well-known location researchers and
// scanners check. Contact points at GitHub private vulnerability reporting
// (the channel SECURITY.md asks reporters to use) and Policy at SECURITY.md.
//
// Expires is required by RFC 9116 and, per §2.5.5, "is formatted according to
// the Internet profile of [ISO.8601] as defined in [RFC3339]" — the RFC's own
// example is `Expires: 2021-12-31T18:37:07.000Z`. Date#toISOString() produces
// exactly this profile. The value is set just under one year ahead of the
// build (§2.5.5 recommends less than a year) so each deploy keeps it current.
//
// Canonical intentionally uses the configured production origin: `site` is
// pinned in astro.config.mjs, so every deploy — previews included — emits the
// production URL, which is correct because RFC 9116's Canonical field names
// the authoritative location of the file, not the URL it happens to be
// served from.

const REPO = 'https://github.com/e35ventura/taopedia';

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

export function buildSecurityTxt({ origin, now = new Date() }) {
  const canonicalOrigin = trimTrailingSlash(origin || 'https://taopedia.org');
  const expires = new Date(now.getTime());
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  expires.setUTCDate(expires.getUTCDate() - 1);

  return [
    `# Vulnerability disclosure for Taopedia. Full policy: ${REPO}/blob/main/SECURITY.md`,
    '',
    `Contact: ${REPO}/security/advisories/new`,
    `Policy: ${REPO}/blob/main/SECURITY.md`,
    `Canonical: ${canonicalOrigin}/.well-known/security.txt`,
    'Preferred-Languages: en',
    `Expires: ${expires.toISOString()}`,
    '',
  ].join('\n');
}
