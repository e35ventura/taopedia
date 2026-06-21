import assert from 'node:assert/strict';
import { buildSecurityTxt } from './security-txt.js';

const now = new Date('2026-06-11T00:00:00.000Z');
const txt = buildSecurityTxt({ origin: 'https://taopedia.org', now });

// RFC 9116 requires at least one Contact field, given as a secure URI.
const contact = txt.match(/^Contact: (\S+)$/m);
assert.ok(contact, 'security.txt must declare a Contact field');
assert.match(contact[1], /^https:\/\//, 'Contact must be a secure (https) URI');

// RFC 9116 §2.5.5: the Expires value "is formatted according to the Internet
// profile of [ISO.8601] as defined in [RFC3339]"; the RFC's own example is
// `Expires: 2021-12-31T18:37:07.000Z`. Assert that exact profile.
const expires = txt.match(/^Expires: (\S+)$/m);
assert.ok(expires, 'security.txt must declare an Expires field (required by RFC 9116)');
assert.match(
  expires[1],
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,
  'Expires must use the RFC 3339 Internet date/time profile required by RFC 9116 §2.5.5',
);
const expiresDate = new Date(expires[1]);
assert.ok(!Number.isNaN(expiresDate.getTime()), 'Expires must parse as a date');
assert.ok(expiresDate.getTime() > now.getTime(), 'Expires must be in the future');

// §2.5.5 recommends an Expires less than a year away; the builder sets it just
// under one year so each deploy keeps the file current.
const oneYear = new Date(now.getTime());
oneYear.setUTCFullYear(oneYear.getUTCFullYear() + 1);
assert.ok(
  expiresDate.getTime() < oneYear.getTime(),
  'Expires should be less than one year in the future (RFC 9116 §2.5.5)',
);

// A real build (default `now`) must also produce a future-dated file, so the
// frozen-date case above cannot mask a stale-expiry regression.
const liveExpires = buildSecurityTxt({ origin: 'https://taopedia.org' }).match(/^Expires: (\S+)$/m);
assert.ok(
  liveExpires && new Date(liveExpires[1]).getTime() > Date.now(),
  'a default build must emit a future Expires date',
);

// Canonical names the authoritative production location (the configured site
// origin — intentionally also emitted on preview deploys), and Policy points
// at the repository's existing SECURITY.md.
assert.match(
  txt,
  /^Canonical: https:\/\/taopedia\.org\/\.well-known\/security\.txt$/m,
  'Canonical must point at the production /.well-known/security.txt URL',
);
assert.match(
  buildSecurityTxt({ origin: 'https://taopedia.org/', now }),
  /^Canonical: https:\/\/taopedia\.org\/\.well-known\/security\.txt$/m,
  'Canonical must normalize a trailing slash on origin so the well-known URL is not emitted with //',
);
assert.match(
  txt,
  /^Policy: https:\/\/github\.com\/e35ventura\/taopedia\/blob\/main\/SECURITY\.md$/m,
  'Policy must reference the repository SECURITY.md',
);

console.log('security.txt check passed');
