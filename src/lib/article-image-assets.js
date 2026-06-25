const LOCAL_IMAGE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const PASSTHROUGH_IMAGE_URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i;
// data:text/xml and data:application/xml render as a navigable XML document whose
// xml-stylesheet processing instruction can load an XSLT sheet that executes script —
// the same parsed-as-markup surface as the SVG (image/svg+xml) and XHTML
// (application/xhtml+xml) data URLs already blocked here. The article-content
// sanitizer (scripts/sync-articles.js) blocks these XML data: types for links and
// infobox values, so block them for image sources too to keep the two lists in sync.
const UNSAFE_IMAGE_URL_PATTERN = /^(?:javascript|vbscript)\s*:|^data\s*:\s*(?:text\/html|image\/svg\+xml|application\/xhtml\+xml|(?:text|application)\/xml\b|(?:text|application)\/(?:javascript|ecmascript))/i;

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
    // stripUrlObfuscationChars (above) already removes the whole Default_Ignorable
    // class, so java\u00ADscript: / data:text\u200b/html are caught -- but the NAMED
    // entities for that class were never decoded, so java&shy;script: stayed literal
    // and passed isUnsafeImageUrl while a browser decodes &shy; and ignores the char.
    // These are exactly the HTML named character references that resolve to a
    // Default_Ignorable code point; collapse them to nothing like their stripped chars.
    .replace(/&(?:shy|ZeroWidthSpace|zwnj|zwj|lrm|rlm|NoBreak|af|ApplyFunction|it|InvisibleTimes|ic|InvisibleComma);/gi, '')
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
