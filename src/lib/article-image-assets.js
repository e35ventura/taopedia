const LOCAL_IMAGE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const PASSTHROUGH_IMAGE_URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i;
const UNSAFE_IMAGE_URL_PATTERN = /^(?:javascript|vbscript)\s*:|^data\s*:\s*(?:text\/html|image\/svg\+xml|application\/xhtml\+xml|(?:text|application)\/(?:javascript|ecmascript))/i;

function decodePathSegments(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isPassthroughImageUrl(value) {
  return PASSTHROUGH_IMAGE_URL_PATTERN.test(value);
}

// Mirror sync-articles' decodeForSchemeScan: strip C0/C1 controls, DEL, and the
// full Default_Ignorable_Code_Point class (zero-width spaces/joiners, soft
// hyphen U+00AD, word joiner U+2060, bidi marks, BOM, ...), not a hand-picked
// subset -- a scheme like javascript: can be hidden behind any of these
// (java\u00ADscript:, java\u2060script:, java\u0085script:) and a narrower
// list can always be evaded by a character it happened to miss.
const DEFAULT_IGNORABLE_PATTERN = /\p{Default_Ignorable_Code_Point}/u;

function stripUrlObfuscationChars(value) {
  let result = '';
  for (const char of value) {
    const code = char.codePointAt(0);
    const isControl = code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f);
    if (!isControl && !DEFAULT_IGNORABLE_PATTERN.test(char)) {
      result += char;
    }
  }
  return result;
}

function fromCodePoint(codePoint, fallback) {
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : fallback;
}

function decodeEntityPass(value) {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (match, hex) => fromCodePoint(Number.parseInt(hex, 16), match))
    .replace(/&#(\d+);?/g, (match, dec) => fromCodePoint(Number.parseInt(dec, 10), match))
    // Mirror sync-articles' decodeForSchemeScan: ":" (&colon;), "/" (&sol;) and
    // "+" (&plus;) each decode in a browser the same as their numeric (&#43;) and
    // literal forms, so all three spellings must collapse alike. Without &plus;,
    // an unsafe data URL hides behind the named entity in its MIME type --
    // `data:image/svg&plus;xml;base64,...` would pass isUnsafeImageUrl as safe and
    // render as a live infobox <img src>, while the numeric/literal forms are caught.
    .replace(/&colon;/gi, ':')
    .replace(/&sol;/gi, '/')
    .replace(/&plus;/gi, '+')
    .replace(/&(?:tab|newline);/gi, '')
    .replace(/&amp;/gi, '&');
}

function decodeUrlSchemeObfuscation(value) {
  let decoded = value;
  let previous;
  do {
    previous = decoded;
    decoded = decodeEntityPass(previous);
  } while (decoded !== previous);
  return decoded;
}

export function isUnsafeImageUrl(value) {
  if (typeof value !== 'string') return false;

  return UNSAFE_IMAGE_URL_PATTERN.test(
    stripUrlObfuscationChars(decodeUrlSchemeObfuscation(value.trim())),
  );
}

export function normalizeArticleLocalImagePath(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || isPassthroughImageUrl(trimmed)) return null;

  const withoutDotPrefix = trimmed.replace(/^\.\/+/, '');
  const normalized = withoutDotPrefix.replace(/\\/g, '/');
  const decoded = decodePathSegments(normalized).replace(/\\/g, '/');
  const segments = decoded.split('/');

  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..')
    || !LOCAL_IMAGE_EXTENSION_PATTERN.test(decoded)
  ) {
    return null;
  }

  return decoded;
}

export function hasLocalImagePathTraversal(value) {
  if (typeof value !== 'string') return false;

  const trimmed = value.trim();
  if (!trimmed || isPassthroughImageUrl(trimmed)) return false;

  const normalized = trimmed.replace(/\\/g, '/');
  const decoded = decodePathSegments(normalized).replace(/\\/g, '/');
  return decoded.split('/').some((segment) => segment === '..');
}

export function resolveArticleImageSource(articleSlug, value, imageAssets) {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (isUnsafeImageUrl(trimmed)) return undefined;
  if (isPassthroughImageUrl(trimmed)) return trimmed;

  const localPath = normalizeArticleLocalImagePath(trimmed);
  if (!localPath) {
    return hasLocalImagePathTraversal(trimmed) ? undefined : trimmed;
  }

  return imageAssets[`../../content/pages/${articleSlug}/${localPath}`] ?? trimmed;
}
