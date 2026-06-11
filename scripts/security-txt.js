// Build an RFC 9116 security.txt that exposes the repository's existing
// SECURITY.md disclosure policy at the well-known location security researchers
// and scanners look for. Contact and Policy point at the repository's GitHub
// security policy page and SECURITY.md, matching how SECURITY.md asks reporters
// to use GitHub private vulnerability reporting. Expires is required by RFC 9116
// and is set just under one year ahead of the build (RFC 9116 recommends less
// than a year) so each deploy keeps the file current.

const REPO = 'https://github.com/e35ventura/taopedia';

export function buildSecurityTxt({ origin, now = new Date() }) {
  const expires = new Date(now.getTime());
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  expires.setUTCDate(expires.getUTCDate() - 1);

  return [
    `# Security policy for Taopedia (${origin})`,
    `# Full policy: ${REPO}/blob/main/SECURITY.md`,
    '',
    `Contact: ${REPO}/security/policy`,
    `Policy: ${REPO}/blob/main/SECURITY.md`,
    `Canonical: ${origin}/.well-known/security.txt`,
    'Preferred-Languages: en',
    `Expires: ${expires.toISOString()}`,
    '',
  ].join('\n');
}
