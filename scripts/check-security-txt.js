import assert from 'node:assert/strict';
import { buildSecurityTxt } from './security-txt.js';

const now = new Date('2026-06-11T00:00:00.000Z');
const txt = buildSecurityTxt({ origin: 'https://taopedia.org', now });

// RFC 9116 requires at least one Contact field and exactly the Expires field.
const contact = txt.match(/^Contact: (\S+)$/m);
assert.ok(contact, 'security.txt must declare a Contact field');
assert.match(contact[1], /^https:\/\//, 'Contact must be a secure (https) URI');

const expires = txt.match(/^Expires: (\S+)$/m);
assert.ok(expires, 'security.txt must declare an Expires field (required by RFC 9116)');
const expiresDate = new Date(expires[1]);
assert.ok(!Number.isNaN(expiresDate.getTime()), 'Expires must be a valid ISO 8601 timestamp');
assert.ok(expiresDate.getTime() > now.getTime(), 'Expires must be in the future');

// Expires is set just under one year ahead of the build so each deploy keeps it
// current, while staying within RFC 9116's "less than a year" recommendation.
const expected = new Date(now.getTime());
expected.setUTCFullYear(expected.getUTCFullYear() + 1);
expected.setUTCDate(expected.getUTCDate() - 1);
assert.equal(expires[1], expected.toISOString(), 'Expires must be just under one year after the build time');

const oneYear = new Date(now.getTime());
oneYear.setUTCFullYear(oneYear.getUTCFullYear() + 1);
assert.ok(
  expiresDate.getTime() < oneYear.getTime(),
  'Expires should be less than one year in the future (RFC 9116 §2.5.5)',
);

// Canonical must point at the served location, and Policy must reference the
// repository's existing SECURITY.md.
assert.match(
  txt,
  /^Canonical: https:\/\/taopedia\.org\/\.well-known\/security\.txt$/m,
  'Canonical must point at the served /.well-known/security.txt URL',
);
assert.match(
  txt,
  /^Policy: https:\/\/github\.com\/e35ventura\/taopedia\/blob\/main\/SECURITY\.md$/m,
  'Policy must reference the repository SECURITY.md',
);

// The Canonical origin must follow the supplied origin (no hardcoded host), so
// the file is correct on preview deploys as well as production.
const preview = buildSecurityTxt({ origin: 'https://preview.example.net', now });
assert.match(
  preview,
  /^Canonical: https:\/\/preview\.example\.net\/\.well-known\/security\.txt$/m,
  'Canonical must use the supplied origin',
);

console.log('security.txt check passed');
