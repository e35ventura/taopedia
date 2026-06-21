import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { hasLocalImagePathTraversal, isUnsafeImageUrl } from '../src/lib/article-image-assets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const defaultArticlesRoot = path.resolve(projectRoot, '..', 'taopedia-articles');
const articlesRoot = process.env.TAOPEDIA_ARTICLES_DIR
  ? path.resolve(process.env.TAOPEDIA_ARTICLES_DIR)
  : defaultArticlesRoot;
const articlesRepoRef = process.env.TAOPEDIA_ARTICLES_REF || 'main';
const cacheArticlesRoot = path.join(projectRoot, '.cache', 'taopedia-articles');
let sourceRoot = path.join(articlesRoot, 'content', 'pages');
const targetRoot = path.join(projectRoot, 'src', 'content', 'pages');
const allowedAssetExtensions = new Set(['.avif', '.gif', '.jpg', '.jpeg', '.json', '.png', '.webp']);
const maxAssetBytes = 5 * 1024 * 1024;
// Astro template directives execute at build time and must never appear in
// article content. They are checked twice — literally below, and again after
// entity/zero-width deobfuscation (see obfuscatedSchemePatterns) — so an
// obfuscated spelling like `set&colon;html` or `set:ht{soft-hyphen}ml` cannot
// slip the literal scan, exactly as the dangerous URL schemes are. Shared by
// both scans so the two lists cannot drift and cover a different directive set.
//
// The patterns are anchored to the EXACT set of Astro 6.x directive values
// documented at https://docs.astro.build/en/reference/directives-reference/
// for this repo's `astro ^6.3.8` (package.json) — not `[a-z-]+` — so prose
// like "a vector is:one validator" no longer false-positives after
// entity/control-character stripping decodes "is:\n" → "is:" + the next
// word. Every documented directive value is still blocked; only obvious
// prose like "is:one" is now allowed through. Regression accept tests pin
// the prose cases below.
//
// Astro 6.x directives: set:html, set:text; class:list (special);
// client:load, client:idle, client:visible, client:media, client:only;
// server:defer; is:raw, is:inline, is:global; define:vars.
const directivePatterns = [
  { pattern: /\bset:(html|text)\b/i, reason: 'set directives are not allowed in article content' },
  { pattern: /\bclass:list\b/i, reason: 'class:list directives are not allowed in article content' },
  { pattern: /\bclient:(load|idle|visible|only|media)\b/i, reason: 'client directives are not allowed in article content' },
  { pattern: /\bserver:(defer)\b/i, reason: 'server directives are not allowed in article content' },
  { pattern: /\bis:(raw|inline|global)\b/i, reason: 'is directives are not allowed in article content' },
  { pattern: /\bdefine:(vars)\b/i, reason: 'define directives are not allowed in article content' },
];

// Bidirectional control characters (Trojan Source, CVE-2021-42574) reorder how
// text renders without changing its bytes, so a link can display as a trusted
// host while resolving elsewhere, or prose can be scrambled past a reviewer.
// Shared by the article-content scan and the infobox JSON checks so every place
// that renders article text rejects them. Written as \uXXXX escapes so this
// rule stays bidi-free itself.
const bidiControlPattern = /[\u202a-\u202e\u2066-\u2069]/;

const unsafeContentPatterns = [
  { pattern: /^\s*import\s/m, reason: 'MDX imports are not allowed in article content' },
  { pattern: /^\s*export\s/m, reason: 'MDX exports are not allowed in article content' },
  { pattern: /<\s*script[\s>]/i, reason: 'script tags are not allowed in article content' },
  { pattern: /<\s*\/\s*script\s*>/i, reason: 'script tags are not allowed in article content' },
  { pattern: /<\s*(base|frame|frameset|iframe|object|embed|link|meta|style|form|input|button|textarea|select|option|fieldset|legend|datalist|output)\b/i, reason: 'active HTML elements are not allowed in article content' },
  // <dialog open> renders in the browser top layer -- above all page content, with
  // a backdrop -- with no script and no inline style. That makes a raw <dialog> a
  // clickjacking/phishing overlay primitive (e.g. a fake "wallet compromised" modal
  // covering the article). Article bodies never need it, so block the element.
  { pattern: /<\s*dialog\b/i, reason: 'dialog elements are not allowed in article content' },
  // <details>/<summary> expose interactive disclosure panels in article bodies with
  // no script and no inline style — the same unwanted interactive surface as dialog.
  { pattern: /<\s*details\b/i, reason: 'details elements are not allowed in article content' },
  { pattern: /<\s*summary\b/i, reason: 'summary elements are not allowed in article content' },
  // <template> parses its contents into an inert document fragment rather than the
  // live DOM. That makes it a DOM-clobbering / mutation-XSS surface (named elements
  // inside can shadow `document.<name>` globals, and the hidden subtree is a known
  // sanitizer-evasion trick), with no rendered output a reader would ever want in
  // glossary prose. Block the element outright, like the other parsing-context tags.
  { pattern: /<\s*template\b/i, reason: 'template elements are not allowed in article content' },
  // <fencedframe> embeds cross-origin content in its own browsing context, the
  // same embedding/clickjacking/phishing surface as the already-blocked <iframe>
  // (it is the Privacy Sandbox successor to it). Article bodies never embed other
  // origins, so block it alongside the other embedding elements.
  { pattern: /<\s*fencedframe\b/i, reason: 'fencedframe elements are not allowed in article content' },
  // <portal> is the other experimental page-embedding element: it loads and
  // previews another document in its own browsing context, then can activate
  // (navigate) to it — the same cross-origin embedding / clickjacking / phishing
  // surface as <iframe> and <fencedframe>. Article bodies never embed other
  // origins, so block it alongside the rest of the embedding family.
  { pattern: /<\s*portal\b/i, reason: 'portal elements are not allowed in article content' },
  // <video>/<audio> render native media controls in article bodies even though CSP
  // sets media-src 'none' — an injected tag is still a distraction/phishing primitive.
  { pattern: /<\s*(video|audio)\b/i, reason: 'media elements are not allowed in article content' },
  // <picture>/<source> steer responsive image loading to attacker-chosen URLs outside
  // the img-src checks that apply to plain <img> tags in article bodies alone.
  { pattern: /<\s*(picture|source)\b/i, reason: 'picture and source elements are not allowed in article content' },
  // <map>/<area> define client-side image maps — a clickjacking primitive on allowed
  // <img> tags that bypasses ordinary href scheme checks when paired with usemap=.
  { pattern: /<\s*(map|area)\b/i, reason: 'image map elements are not allowed in article content' },
  // <svg> and <math> are foreign-content roots: a browser parses their subtree
  // with XML/foreign rules, which is a classic mXSS vector (e.g. an <svg> can
  // carry <foreignObject> HTML, animation elements that retarget attributes, or
  // namespaced links). Article bodies are plain glossary prose and never need
  // either element, so block them outright rather than relying on the script /
  // handler / scheme scans alone.
  { pattern: /<\s*(svg|math)\b/i, reason: 'SVG and MathML elements are not allowed in article content' },
  // <noscript> is parsed under different rules depending on the browser's scripting
  // state, a known mutation-XSS / sanitizer-confusion surface (sanitizers such as
  // DOMPurify special-case it). A glossary never needs script-fallback markup, so
  // block the element like the other parsing-context tags.
  { pattern: /<\s*noscript\b/i, reason: 'noscript elements are not allowed in article content' },
  // <noframes>/<noembed> are the obsolete siblings of <noscript>: their contents
  // are parsed as raw text whose visibility flips on the browser's frames/embed
  // support state, the same parsing-state-dependent mutation-XSS / sanitizer-
  // confusion surface DOMPurify special-cases for noscript. A glossary never needs
  // frames/embed fallback markup, so block them alongside noscript.
  { pattern: /<\s*(noframes|noembed)\b/i, reason: 'noframes and noembed elements are not allowed in article content' },
  // <marquee> still renders an animated, attention-grabbing scrolling banner in
  // every current browser. An injected <marquee> in article content is a concrete
  // content-spoofing / phishing surface (e.g. a fake scrolling "wallet compromised"
  // alert) with no script, handler, or flagged scheme. Block it like the other
  // unwanted rendered elements (video/audio/picture, dialog, details).
  { pattern: /<\s*marquee\b/i, reason: 'marquee elements are not allowed in article content' },
  // <font>/<basefont>/<center> are obsolete presentational elements that every
  // browser still renders. They re-introduce the exact content-styling spoof the
  // inline `style=` attribute is blocked to prevent — <font color/size/face> sets
  // arbitrary text colour and size (a fake red oversized "wallet compromised"
  // warning), <basefont> restyles the whole page's text, and <center> repositions
  // content — all without the blocked attribute, with no script or flagged scheme.
  { pattern: /<\s*(font|basefont|center)\b/i, reason: 'font, basefont, and center elements are not allowed in article content' },
  // <big>/<strike>/<tt>/<nobr> are the obsolete presentational text elements that
  // browsers still render: they re-style text (enlarge, strike through, force
  // monospace, suppress wrapping) without the blocked inline style= attribute — the
  // same no-attribute content-styling spoof as <font>/<center> above, with no
  // script, handler, or flagged scheme. Block them with the rest.
  { pattern: /<\s*(big|strike|tt|nobr)\b/i, reason: 'big, strike, tt, and nobr elements are not allowed in article content' },
  // <plaintext>/<xmp>/<listing> are obsolete raw-text elements that browsers still
  // honor in the parser. A single injected <plaintext> makes the browser render
  // EVERYTHING after it — the rest of the article and page — as literal text: a
  // concrete defacement / content-break vector with no script, handler, or scheme.
  // (<xmp>/<listing> render their contents as raw preformatted text similarly.)
  { pattern: /<\s*(plaintext|xmp|listing)\b/i, reason: 'plaintext, xmp, and listing elements are not allowed in article content' },
  // <bdo> is the bidirectional-OVERRIDE element: it forces its text to lay out in
  // an explicit direction, overriding the Unicode bidi algorithm. An injected
  // <bdo dir="rtl"> reverses the displayed character order — the markup form of the
  // bidi control characters already blocked above (Trojan Source, CVE-2021-42574):
  // a reversed scam address or URL can be made to render as a legitimate-looking
  // string, with no script, handler, or flagged scheme. The `dir` attribute on an
  // ordinary element only sets base paragraph direction and does NOT reverse LTR
  // runs, so <bdo> is a distinct primitive; a glossary's prose never needs it.
  { pattern: /<\s*bdo\b/i, reason: 'bidirectional override (bdo) elements are not allowed in article content' },
  // <meter>/<progress> render native gauge and progress-bar widgets in every
  // current browser. An injected one in article prose is a content-spoofing
  // surface — e.g. a fake "wallet scan 80%" progress bar or a coloured risk
  // gauge that lends false legitimacy to a phishing block — with no script,
  // handler, or flagged scheme. A glossary never renders live status widgets, so
  // block them like the other non-prose rendered elements (marquee, video/audio).
  { pattern: /<\s*(meter|progress)\b/i, reason: 'meter and progress elements are not allowed in article content' },
  // <canvas> renders a sized bitmap graphics region in every browser. An injected
  // one (e.g. <canvas width="1200" height="2000">) reserves a large blank area
  // that pushes the real article off-screen — a layout-defacement surface — and
  // it is the scripting-companion drawing element a static glossary never needs.
  // Block it like the other non-prose rendered elements.
  { pattern: /<\s*canvas\b/i, reason: 'canvas elements are not allowed in article content' },
  { pattern: /\sslot\s*=/i, reason: 'slot attributes are not allowed in article content' },
  // The <style> element is already blocked above, but an inline `style=`
  // attribute on any allowed element is the matching gap: it lets injected CSS
  // exfiltrate data (`background:url(//evil/?leak)`), overlay/clickjack the page
  // (`position:fixed`), or spoof content — all with no script, handler, or
  // flagged scheme. Article bodies are plain prose, so the attribute is blocked.
  { pattern: /\sstyle\s*=/i, reason: 'inline style attributes are not allowed in article content' },
  // bgcolor= is the obsolete presentational sibling of style=: on an allowed
  // <table>/<td>/<tr> (or <body>) it paints an arbitrary background colour with no
  // attribute the style= rule covers — a content-spoofing surface (a fake red
  // "alert" box around injected text) with no script, handler, or flagged scheme.
  // Article tables never set colours, so block the attribute like style=.
  { pattern: /\sbgcolor\s*=/i, reason: 'bgcolor attributes are not allowed in article content' },
  // background= is the obsolete presentational image sibling of bgcolor=: on an
  // allowed <body>/<table>/<td> it loads an arbitrary external image as a tiled
  // background. That makes it a no-script tracking beacon — like the blocked
  // `ping=`, it leaks the reader's visit to an attacker-chosen URL — and a content
  // spoof, with no handler or flagged scheme. Article markup never sets it.
  { pattern: /\sbackground\s*=/i, reason: 'background attributes are not allowed in article content' },
  // align=/valign= are obsolete presentational layout attributes: on an allowed
  // element they reposition content (centre/float/right-align a block, top/bottom
  // a cell) without the blocked inline style= attribute or the blocked <center>
  // element — a content-layout spoof (e.g. an injected paragraph floated over the
  // real text) with no script, handler, or flagged scheme. Block them like style=.
  { pattern: /\s(?:align|valign)\s*=/i, reason: 'align and valign attributes are not allowed in article content' },
  // border=/cellpadding=/cellspacing=/hspace=/vspace= are obsolete presentational
  // sizing/spacing attributes (on <table>/<td>/<img>) that size and space content
  // without the blocked inline style= attribute — e.g. an injected <td hspace> or
  // oversized border reflows the real text, a content-layout spoof with no script,
  // handler, or flagged scheme. Block them like the other presentational attrs.
  { pattern: /\s(?:border|cellpadding|cellspacing|hspace|vspace)\s*=/i, reason: 'border, cellpadding, cellspacing, hspace, and vspace attributes are not allowed in article content' },
  { pattern: /\sxmlns(?:\s*:\s*[\w-]+)?\s*=\s*/i, reason: 'xmlns attributes are not allowed in article content' },
  { pattern: /\son[a-z]+\s*=/i, reason: 'inline event handlers are not allowed in article content' },
  // The `ping` attribute on an <a> (an allowed element) turns a normal-looking
  // link into a tracking beacon: clicking it makes the browser POST to every
  // listed URL, leaking the reader's referrer and click to an attacker with no
  // script, handler, or flagged scheme. Article links never need it, so block it.
  { pattern: /\sping\s*=/i, reason: 'ping attributes are not allowed in article content' },
  // contenteditable/tabindex/draggable on allowed elements expose editing, focus-trap,
  // and drag surfaces a static glossary never needs — with no script, handler, or
  // flagged scheme. Block them like style= and ping= (not on blocked <input>/<button>).
  { pattern: /\scontenteditable\s*=/i, reason: 'contenteditable attributes are not allowed in article content' },
  { pattern: /\stabindex\s*=/i, reason: 'tabindex attributes are not allowed in article content' },
  { pattern: /\sdraggable\s*=/i, reason: 'draggable attributes are not allowed in article content' },
  // download= on an allowed <a> turns a normal link into a drive-by file download;
  // popover= on allowed elements renders a native top-layer overlay (like dialog)
  // with no script or flagged scheme. Article bodies never need either attribute.
  { pattern: /\sdownload\s*=/i, reason: 'download attributes are not allowed in article content' },
  { pattern: /\spopover\s*=/i, reason: 'popover attributes are not allowed in article content' },
  // accesskey= binds a browser keyboard shortcut to an element: an injected
  // accesskey on a hidden link/element lets a single keypress activate it
  // (unexpected navigation / focus hijack), with no script or flagged scheme.
  { pattern: /\saccesskey\s*=/i, reason: 'accesskey attributes are not allowed in article content' },
  // usemap= pairs an allowed <img> with a <map>/<area> click region — blocked above,
  // but the attribute alone still signals an image-map injection attempt.
  { pattern: /\susemap\s*=/i, reason: 'usemap attributes are not allowed in article content' },
  // referrerpolicy= on an allowed <a>/<img> overrides, for that element, the
  // strict `Referrer-Policy: strict-origin-when-cross-origin` header the site
  // deliberately ships (netlify.toml). An injected referrerpolicy="unsafe-url"
  // leaks the full referring URL to an external destination, defeating that
  // policy with no script or flagged scheme. Block the attribute.
  { pattern: /\sreferrerpolicy\s*=/i, reason: 'referrerpolicy attributes are not allowed in article content' },
  // dir= on an allowed element sets base text direction (ltr/rtl/auto). Combined with
  // Unicode bidi it enables Trojan Source visual spoofing (CVE-2021-42574) even though
  // the <bdo> override element and raw bidi controls are already blocked above.
  { pattern: /\sdir\s*=/i, reason: 'dir attributes are not allowed in article content' },
  { pattern: /\bjavascript\s*:/i, reason: 'javascript: URLs are not allowed in article content' },
  { pattern: /\bvbscript\s*:/i, reason: 'vbscript: URLs are not allowed in article content' },
  { pattern: /\bdata\s*:\s*text\/html/i, reason: 'HTML data URLs are not allowed in article content' },
  { pattern: /\bdata\s*:\s*image\/svg\+xml/i, reason: 'SVG data URLs are not allowed in article content' },
  { pattern: /\bdata\s*:\s*application\/xhtml\+xml/i, reason: 'XHTML data URLs are not allowed in article content' },
  { pattern: /\bdata\s*:\s*(?:text|application)\/(?:javascript|ecmascript)/i, reason: 'script data URLs are not allowed in article content' },
  { pattern: bidiControlPattern, reason: 'bidirectional control characters are not allowed in article content' },
  ...directivePatterns,
];

// Dangerous URL schemes can be smuggled past the literal checks above using HTML
// numeric/named entities, control characters, or zero-width characters that a
// browser strips when resolving a URL (e.g. `java&#115;cript:`,
// `javascript&colon;`, `java\tscript:`). Decode those forms before re-scanning.
const obfuscatedSchemePatterns = [
  { pattern: /javascript\s*:/i, reason: 'javascript: URLs are not allowed in article content' },
  { pattern: /vbscript\s*:/i, reason: 'vbscript: URLs are not allowed in article content' },
  { pattern: /data\s*:\s*text\/html/i, reason: 'HTML data URLs are not allowed in article content' },
  { pattern: /data\s*:\s*image\/svg\+xml/i, reason: 'SVG data URLs are not allowed in article content' },
  { pattern: /data\s*:\s*application\/xhtml\+xml/i, reason: 'XHTML data URLs are not allowed in article content' },
  { pattern: /data\s*:\s*(?:text|application)\/(?:javascript|ecmascript)/i, reason: 'script data URLs are not allowed in article content' },
  ...directivePatterns,
];

const infoboxRowValueSchemePatterns = [
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /data\s*:\s*image\/svg\+xml/i,
  /data\s*:\s*application\/xhtml\+xml/i,
  /data\s*:\s*(?:text|application)\/(?:javascript|ecmascript)/i,
];

function assertSafeInfoboxRowValue(value, filePath, index) {
  const decoded = decodeForSchemeScan(value);
  for (const pattern of infoboxRowValueSchemePatterns) {
    if (pattern.test(value) || pattern.test(decoded)) {
      throw new Error(
        `Invalid infobox JSON asset in "${filePath}": rows[${index}].value contains a disallowed URL scheme`,
      );
    }
  }
}

// The whitespace-anchored handler pattern above misses handlers that HTML lets
// follow an attribute with a non-space delimiter — a slash (`<img src=x/onerror=…>`)
// or a quote abutting the handler (`<a href="x"onclick=…>`). Browsers still parse
// these. Detecting them must NOT scan inside quoted attribute values, or a benign
// URL such as `src="/online=1"` would be flagged. So the scan runs against a copy
// with quoted values emptied: the URL text inside them is removed, while the
// closing quote (a real attribute boundary) is preserved so `"x"onclick=` is caught.
const nonSpaceDelimitedHandlerPattern = /<[^>]*[/"'`]on[a-z]+\s*=/i;

// contenteditable/tabindex/draggable can follow a non-space delimiter after a prior
// attribute (`href="x"contenteditable=…>`, `class=x/tabindex=`). Scan with quoted
// values emptied like the handler check so benign URLs such as src="/online=1" pass.
const nonSpaceDelimitedInteractionSurfaceAttrPattern =
  /<[^>]*[/"'`](?:contenteditable|tabindex|draggable|download|popover|usemap|accesskey|referrerpolicy|dir)\s*=/i;

// width=/height= on an allowed <img> reserve an oversized layout box without the
// blocked inline style= attribute — a layout-defacement surface (the same class
// as border=/hspace= on tables, merged in #438). Tag-scoped to <img> and scanned
// on emptyQuotedAttributeValues() so quoted alt text mentioning dimensions passes.
const imgDimensionAttrPattern = /<\s*img\b[^>]*\s(?:width|height)\s*=/i;
const nonSpaceDelimitedImgDimensionAttrPattern = /<\s*img\b[^>]*[/"'`](?:width|height)\s*=/i;

// width=/height= on allowed <table>/<td>/<th> reserve oversized layout boxes
// without the blocked inline style= attribute — same layout-defacement class as
// the merged border=/hspace=/vspace= (#438) on tables and width=/height= on
// <img> (#451). Closing the table-family half the #451 comment explicitly
// foreshadows. Tag-scoped to table-family elements (table/td/th) and scanned on
// emptyQuotedAttributeValues() so benign prose or class values mentioning
// "width"/"height" pass.
const tableDimensionAttrPattern = /<\s*(?:table|td|th)\b[^>]*\s(?:width|height)\s*=/i;
const nonSpaceDelimitedTableDimensionAttrPattern = /<\s*(?:table|td|th)\b[^>]*[/"'`](?:width|height)\s*=/i;

// width=/height= on allowed <tr>/<hr>/<pre> reserve oversized layout boxes
// without the blocked inline style= attribute — the remaining half of the
// dimension-attribute surface merged #451 / #465 close for <img> /
// <table>/<td>/<th>. <hr width="5000"> draws a horizontal line that pushes the
// article body; <pre width="5000"> reserves an oversized preformatted block;
// <tr height="9999"> claims a row that pushes real content off-screen. Same
// layout-defacement class as the merged #438 / #451 / #465 rules. Tag-scoped
// and scanned on emptyQuotedAttributeValues() so benign prose and class values
// pass.
const rowHrPreDimensionAttrPattern = /<\s*(?:tr|hr|pre)\b[^>]*\s(?:width|height)\s*=/i;
const nonSpaceDelimitedRowHrPreDimensionAttrPattern = /<\s*(?:tr|hr|pre)\b[^>]*[/"'`](?:width|height)\s*=/i;

// autofocus steals keyboard focus on page load — a focus-theft primitive on allowed
// elements with no script. Tag-boundary lookahead catches autofocus before another
// attribute (<div autofocus class="x">). Quote-abutted only — no slash delimiter,
// because class=x/autofocus is a class value, not an autofocus attribute (parse5).
const autofocusAttrPattern = /<[^>]*\sautofocus(?=[\s>/=])/i;
const quoteAbuttedAutofocusAttrPattern = /<[^>]*["'`]autofocus(?=[\s>/=])/i;

// hidden on allowed elements removes content from layout but keeps it in the DOM —
// an injected <a hidden href="…"> is still a navigable link with no script.
// Same tag-boundary / quote-abutted detection as autofocus (merged #453).
const hiddenAttrPattern = /<[^>]*\shidden(?=[\s>/=])/i;
const quoteAbuttedHiddenAttrPattern = /<[^>]*["'`]hidden(?=[\s>/=])/i;

// nowrap on allowed <td>/<th> disables text wrapping in the cell — an injected
// long URL, fake wallet address, or padded phishing line breaks out of the
// column, reflowing the real article text off-screen (a layout-defacement /
// content-spoof primitive in the same class as the merged #451 / #465 cell
// dimension blocks). Article tables in a glossary never set nowrap themselves —
// the stylesheet handles wrapping via .mw-subnets / infobox classes. Tag-scoped
// to td|th with the [\s>/=] boolean lookahead the merged autofocus/hidden rules
// use, so benign prose and class values pass.
const tdThNowrapAttrPattern = /<\s*(?:td|th)\b[^>]*\snowrap(?=[\s>/=])/i;
const quoteAbuttedTdThNowrapAttrPattern = /<\s*(?:td|th)\b[^>]*["'`]nowrap(?=[\s>/=])/i;

// colspan=/rowspan= on allowed <td>/<th> merge or split table cells without the
// blocked inline style= attribute — e.g. colspan="99" makes one injected cell
// span the full table width, a content-layout spoof with no script, handler, or
// flagged scheme. Same class as merged #465 (table dimensions) and #479 (nowrap).
const tdThSpanAttrPattern = /<\s*(?:td|th)\b[^>]*\s(?:colspan|rowspan)\s*=/i;
const nonSpaceDelimitedTdThSpanAttrPattern = /<\s*(?:td|th)\b[^>]*[/"'`](?:colspan|rowspan)\s*=/i;

// srcset=/sizes= on an allowed <img> steer responsive image loading to attacker-chosen
// URLs — the gap left after merged #411 blocked <picture>/<source> but not plain
// <img srcset>/<img sizes>. Tag-scoped, emptyQuotedAttributeValues(), ["'`] only.
const imgSrcsetAttrPattern = /<\s*img\b[^>]*\ssrcset\s*=/i;
const imgSrcsetQuoteAbuttedPattern = /<\s*img\b[^>]*["'`]srcset\s*=/i;
const imgSizesAttrPattern = /<\s*img\b[^>]*\ssizes\s*=/i;
const imgSizesQuoteAbuttedPattern = /<\s*img\b[^>]*["'`]sizes\s*=/i;

// loading= on an allowed <img> defers subresource fetch until the image nears the
// viewport — a scroll-triggered tracking/beacon primitive on attacker-chosen URLs
// (same img-scoped family as merged width/height #451 and srcset/sizes #461).
const imgLoadingAttrPattern = /<\s*img\b[^>]*\sloading\s*=/i;
const imgLoadingQuoteAbuttedPattern = /<\s*img\b[^>]*["'`]loading\s*=/i;

// fetchpriority= on an allowed <img> bumps subresource fetch priority for attacker-chosen
// URLs ahead of legitimate page assets (same img-scoped family as loading #462).
const imgFetchpriorityAttrPattern = /<\s*img\b[^>]*\sfetchpriority\s*=/i;
const imgFetchpriorityQuoteAbuttedPattern = /<\s*img\b[^>]*["'`]fetchpriority\s*=/i;

// ismap on an allowed <img> is the server-side image-map primitive (the counterpart
// to the already-blocked client-side <map>/<area>/usemap= in #411). When set on an
// <img> nested in an <a href="...">, the browser appends the click coordinates
// (e.g. ?37,128) to the link URL — a click beacon with no script, handler, or
// flagged scheme. Tag-scoped to <img> and scanned on emptyQuotedAttributeValues()
// so alt text containing the literal word "ismap" passes. Delimiter is whitespace,
// quote, or backtick (NOT /); including / as a delimiter triggers the #449 false
// positive Codex flagged on unquoted URLs containing "/ismap." (e.g.
// /wiki/ismap-demo.png), and slash-delimited boolean attributes are not a realistic
// Markdown injection surface — same tradeoff as the merged autofocus/hidden rules.
const imgIsmapAttrPattern = /<\s*img\b[^>]*\sismap(?=[\s>/=])/i;
const quoteAbuttedImgIsmapAttrPattern = /<\s*img\b[^>]*["'`]ismap(?=[\s>/=])/i;

// frame=/rules=/summary= on an allowed <table> set the obsolete presentational
// table-border attributes without the blocked inline style= attribute — same
// content-styling spoof class as the merged border=/cellpadding= (#438) and
// the table dimension attributes (#465). frame= picks which sides of the outer
// border to draw (e.g. frame="border"); rules= picks which inner borders
// (e.g. rules="all" yields a heavy grid). summary= is the HTML4 accessibility
// description (deprecated in HTML5, ignored by current screen readers as the
// <caption> element supersedes it). Article tables never set their own border
// styles — the stylesheet renders them via .mw-subnets / infobox classes.
const tableFrameRulesAttrPattern = /<\s*table\b[^>]*\s(?:frame|rules|summary)\s*=/i;
const nonSpaceDelimitedTableFrameRulesAttrPattern = /<\s*table\b[^>]*[/"'`](?:frame|rules|summary)\s*=/i;

function emptyQuotedAttributeValues(content) {
  return content.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
}

const hiddenTopics = new Set(['bittensor']);

function normalizeCategoryLabel(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPublishedArticle(data) {
  return data.draft !== true;
}

export function toCategories(data) {
  const categories = new Map();
  const addCategory = (rawValue) => {
    const normalized = normalizeCategoryLabel(rawValue);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (hiddenTopics.has(key)) return;
    if (!categories.has(key)) categories.set(key, normalized);
  };

  if (typeof data.category === 'string') {
    addCategory(data.category);
  }
  if (Array.isArray(data.categories)) {
    for (const category of data.categories) addCategory(category);
  }
  if (Array.isArray(data.tags)) {
    for (const tag of data.tags) addCategory(tag);
  }
  return Array.from(categories.values());
}

function validateSlug(slug) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
    throw new Error(`Unsafe article slug "${slug}". Use lowercase letters, numbers, underscores, and hyphens.`);
  }
}

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === ''
    || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function assertRegularFileInside(root, filePath, description = 'File') {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`${description} must not be a symlink: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${description} must be a regular file: ${filePath}`);
  }

  const rootRealPath = fs.realpathSync(root);
  const fileRealPath = fs.realpathSync(filePath);
  if (!isPathInside(rootRealPath, fileRealPath)) {
    throw new Error(`${description} must be inside article source root: ${filePath}`);
  }

  return stat;
}

// Articles may be authored as index.mdx or plain Markdown index.md. The content
// sanitizer rejects every MDX-specific feature, so index.md is a natural source
// format, and copyDir, the content-collection glob, and the history walker all
// already accept both. Resolve whichever the directory provides (preferring
// index.mdx) and run the same security validation, so a valid index.md article
// is published instead of being silently skipped. Returns null when neither
// index file exists; other validation failures (symlink, traversal) still throw.
export function resolveArticleSourceFile(sourceDir, sourceRoot, description = 'Article entry') {
  for (const name of ['index.mdx', 'index.md']) {
    const candidate = path.join(sourceDir, name);
    try {
      assertRegularFileInside(sourceRoot, candidate, description);
      return candidate;
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
  }
  return null;
}

function fromCodePoint(codePoint, fallback) {
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : fallback;
}

// Remove characters a browser ignores inside a URL — C0/C1 control characters
// (including tab/newline/CR), DEL, zero-width characters and the BOM — while
// preserving the ordinary space (U+0020) so plain prose such as "Java Script:"
// is never collapsed into a false positive.
// Unicode "default ignorable" format characters (zero-width spaces/joiners, soft
// hyphen U+00AD, word joiner U+2060, bidi marks, BOM, ...) are invisible and can be
// used to obfuscate a dangerous scheme: "java" + U+00AD + "script:" collapses to
// "javascript:" once the ignorable character is dropped. Strip the whole class, not
// a hand-picked subset of zero-width chars, so the scheme scan cannot be evaded by
// an ignorable character the original list happened to miss.
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

function decodeEntityPass(content) {
  return content
    .replace(/&#x([0-9a-f]+);?/gi, (match, hex) => fromCodePoint(Number.parseInt(hex, 16), match))
    .replace(/&#(\d+);?/g, (match, dec) => fromCodePoint(Number.parseInt(dec, 10), match))
    // Normalize the named HTML entities for characters a scheme or MIME type can hide
    // behind, so an entity-spelled separator cannot evade the scan: ":" (&colon;),
    // "/" (&sol;) and "+" (&plus;) each decode in a browser the same as their numeric
    // (e.g. &#43;) and literal forms, so all three spellings must collapse alike.
    .replace(/&colon;/gi, ':')
    .replace(/&sol;/gi, '/')
    .replace(/&plus;/gi, '+')
    .replace(/&(?:tab|newline);/gi, '')
    .replace(/&amp;/gi, '&');
}

function decodeForSchemeScan(content) {
  let decoded = content;
  let previous;
  do {
    previous = decoded;
    decoded = decodeEntityPass(previous);
  } while (decoded !== previous);
  return stripUrlObfuscationChars(decoded);
}

function blankRange(chars, start, end) {
  for (let index = start; index < end; index += 1) {
    if (chars[index] !== '\n' && chars[index] !== '\r') {
      chars[index] = ' ';
    }
  }
}

function stripMarkdownBlockCode(content, chars) {
  let inFence = false;
  let fenceChar = '';
  let fenceLength = 0;

  for (let lineStart = 0; lineStart < content.length;) {
    const newlineIndex = content.indexOf('\n', lineStart);
    const lineEnd = newlineIndex === -1 ? content.length : newlineIndex + 1;
    const rawLine = content.slice(lineStart, lineEnd);
    const lineText = rawLine.replace(/\r?\n$/, '');

    if (inFence) {
      blankRange(chars, lineStart, lineEnd);
      const closingFence = new RegExp(`^ {0,3}${fenceChar}{${fenceLength},}\\s*$`);
      if (closingFence.test(lineText)) {
        inFence = false;
      }
      lineStart = lineEnd;
      continue;
    }

    const openingFence = lineText.match(/^(?: {0,3})(`{3,}|~{3,})/);
    if (openingFence) {
      inFence = true;
      fenceChar = openingFence[1][0];
      fenceLength = openingFence[1].length;
      blankRange(chars, lineStart, lineEnd);
      lineStart = lineEnd;
      continue;
    }

    // Do NOT treat a 4-space / tab indented line as a code block. MDX disables
    // CommonMark indented code blocks (they collide with JSX indentation), so an
    // indented `{...}` is parsed as a live MDX expression, not inert code — e.g.
    // `- item\n\n    {process.env.SECRET_TOKEN}` evaluates at build time. Blanking
    // indented lines here would hide that brace from findUnescapedMdxBrace and let
    // a build-time secret read past the scan. Only real MDX code spans (fences,
    // handled above, and inline backticks) are stripped.
    lineStart = lineEnd;
  }
}

function stripMarkdownInlineCode(content, chars) {
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== '`' || chars[index] === ' ') continue;

    let tickCount = 1;
    while (content[index + tickCount] === '`') tickCount += 1;

    const marker = '`'.repeat(tickCount);
    const closingIndex = content.indexOf(marker, index + tickCount);
    if (closingIndex === -1) {
      index += tickCount - 1;
      continue;
    }

    blankRange(chars, index, closingIndex + tickCount);
    index = closingIndex + tickCount - 1;
  }
}

function stripMarkdownCode(content) {
  const chars = content.split('');
  stripMarkdownBlockCode(content, chars);
  stripMarkdownInlineCode(content, chars);
  return chars.join('');
}

function isEscapedBrace(content, braceIndex) {
  let backslashes = 0;
  for (let index = braceIndex - 1; index >= 0 && content[index] === '\\'; index -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function findUnescapedMdxBrace(content) {
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if ((char === '{' || char === '}') && !isEscapedBrace(content, index)) {
      return char;
    }
  }
  return null;
}

export function validateArticleContent(slug, content) {
  for (const { pattern, reason } of unsafeContentPatterns) {
    if (pattern.test(content)) {
      throw new Error(`Unsafe article content in "${slug}": ${reason}`);
    }
  }

  const emptiedAttributeContent = emptyQuotedAttributeValues(content);

  if (nonSpaceDelimitedHandlerPattern.test(emptiedAttributeContent)) {
    throw new Error(`Unsafe article content in "${slug}": inline event handlers are not allowed in article content`);
  }

  if (nonSpaceDelimitedInteractionSurfaceAttrPattern.test(emptiedAttributeContent)) {
    throw new Error(
      `Unsafe article content in "${slug}": contenteditable, tabindex, draggable, download, popover, usemap, accesskey, referrerpolicy, and dir attributes are not allowed in article content`,
    );
  }

  if (
    imgDimensionAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedImgDimensionAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": width and height attributes are not allowed in article content`,
    );
  }

  if (
    tableDimensionAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedTableDimensionAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": width and height attributes are not allowed on table elements`,
    );
  }

  if (
    rowHrPreDimensionAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedRowHrPreDimensionAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": width and height attributes are not allowed on tr, hr, or pre elements`,
    );
  }

  if (
    autofocusAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedAutofocusAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": autofocus attributes are not allowed in article content`);
  }

  if (
    hiddenAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedHiddenAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": hidden attributes are not allowed in article content`);
  }

  if (
    tdThNowrapAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedTdThNowrapAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": nowrap attributes are not allowed on td or th elements`,
    );
  }

  if (
    tdThSpanAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedTdThSpanAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": colspan and rowspan attributes are not allowed on table cells`,
    );
  }

  if (
    imgSrcsetAttrPattern.test(emptiedAttributeContent)
    || imgSrcsetQuoteAbuttedPattern.test(emptiedAttributeContent)
    || imgSizesAttrPattern.test(emptiedAttributeContent)
    || imgSizesQuoteAbuttedPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": srcset and sizes attributes are not allowed in article content`,
    );
  }

  if (
    tableFrameRulesAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedTableFrameRulesAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": frame, rules, and summary attributes are not allowed on table elements`,
    );
  }

  if (
    imgLoadingAttrPattern.test(emptiedAttributeContent)
    || imgLoadingQuoteAbuttedPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": loading attributes are not allowed in article content`);
  }

  if (
    imgFetchpriorityAttrPattern.test(emptiedAttributeContent)
    || imgFetchpriorityQuoteAbuttedPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": fetchpriority attributes are not allowed in article content`,
    );
  }

  if (
    imgIsmapAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedImgIsmapAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": ismap attributes are not allowed in article content`);
  }

  const decoded = decodeForSchemeScan(content);
  for (const { pattern, reason } of obfuscatedSchemePatterns) {
    if (pattern.test(decoded)) {
      throw new Error(`Unsafe article content in "${slug}": ${reason}`);
    }
  }

  const markdownBody = matter(content).content;
  if (findUnescapedMdxBrace(stripMarkdownCode(markdownBody))) {
    throw new Error(`Unsafe article content in "${slug}": MDX expression braces are not allowed in article content`);
  }
}

export function validateArticleJsonAsset(filePath) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Malformed JSON asset in "${filePath}": ${error.message}`);
  }

  if (path.basename(filePath) === 'infobox.json') {
    validateInfoboxJsonAsset(filePath, data);
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOptionalString(value, fieldName, filePath) {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`Invalid infobox JSON asset in "${filePath}": ${fieldName} must be a string`);
  }
}

function assertNoBidiControls(value, fieldName, filePath) {
  if (typeof value === 'string' && bidiControlPattern.test(value)) {
    throw new Error(`Invalid infobox JSON asset in "${filePath}": ${fieldName} contains bidirectional control characters`);
  }
}

export function validateInfoboxJsonAsset(filePath, data) {
  if (!isPlainObject(data)) {
    throw new Error(`Invalid infobox JSON asset in "${filePath}": root must be an object`);
  }

  assertOptionalString(data.title, 'title', filePath);
  assertOptionalString(data.image, 'image', filePath);
  assertOptionalString(data.caption, 'caption', filePath);
  assertNoBidiControls(data.title, 'title', filePath);
  assertNoBidiControls(data.caption, 'caption', filePath);

  if (typeof data.image === 'string' && data.image.trim()) {
    if (isUnsafeImageUrl(data.image) || hasLocalImagePathTraversal(data.image)) {
      throw new Error(`Invalid infobox JSON asset in "${filePath}": image URL is not allowed`);
    }
  }

  if (data.rows === undefined) return;
  if (!Array.isArray(data.rows)) {
    throw new Error(`Invalid infobox JSON asset in "${filePath}": rows must be an array`);
  }

  data.rows.forEach((row, index) => {
    if (!isPlainObject(row)) {
      throw new Error(`Invalid infobox JSON asset in "${filePath}": rows[${index}] must be an object`);
    }
    if (typeof row.label !== 'string') {
      throw new Error(`Invalid infobox JSON asset in "${filePath}": rows[${index}].label must be a string`);
    }
    if (typeof row.value !== 'string') {
      throw new Error(`Invalid infobox JSON asset in "${filePath}": rows[${index}].value must be a string`);
    }
    assertNoBidiControls(row.label, `rows[${index}].label`, filePath);
    assertNoBidiControls(row.value, `rows[${index}].value`, filePath);
    assertSafeInfoboxRowValue(row.value, filePath, index);
  });
}

const frontmatterImageFields = ['coverImage', 'infoboxImage', 'image'];

export function validateFrontmatterImageFields(slug, data) {
  if (!isPlainObject(data)) return;

  for (const field of frontmatterImageFields) {
    const value = data[field];
    if (typeof value === 'string' && value.trim()) {
      if (isUnsafeImageUrl(value) || hasLocalImagePathTraversal(value)) {
        throw new Error(`Unsafe frontmatter image in "${slug}": ${field} URL is not allowed`);
      }
    }
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symlinked article source entry is not allowed: ${srcPath}`);
    }
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile() && entry.name !== 'index.mdx' && entry.name !== 'index.md') {
      const ext = path.extname(entry.name).toLowerCase();
      if (!allowedAssetExtensions.has(ext)) {
        throw new Error(`Unsupported asset type in "${srcPath}". Allowed: ${Array.from(allowedAssetExtensions).join(', ')}`);
      }
      const stat = assertRegularFileInside(src, srcPath, 'Article asset');
      if (stat.size > maxAssetBytes) {
        throw new Error(`Asset too large in "${srcPath}". Maximum size is ${maxAssetBytes} bytes.`);
      }
      if (ext === '.json') {
        validateArticleJsonAsset(srcPath);
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main() {
  if (!fs.existsSync(sourceRoot)) {
    fs.mkdirSync(path.dirname(cacheArticlesRoot), { recursive: true });
    if (!fs.existsSync(cacheArticlesRoot)) {
      execFileSync('git', [
        'clone',
        '--depth=1',
        '--branch',
        articlesRepoRef,
        'https://github.com/e35ventura/taopedia-articles.git',
        cacheArticlesRoot,
      ], { stdio: 'inherit' });
    } else {
      execFileSync('git', ['-C', cacheArticlesRoot, 'fetch', '--depth=1', 'origin', articlesRepoRef], { stdio: 'inherit' });
      execFileSync('git', ['-C', cacheArticlesRoot, 'checkout', '--detach', 'FETCH_HEAD'], { stdio: 'inherit' });
    }
    sourceRoot = path.join(cacheArticlesRoot, 'content', 'pages');
  }

  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Article source not found: ${sourceRoot}`);
  }

  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });

  let synced = 0;
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const slug = entry.name;
    validateSlug(slug);
    const sourceDir = path.join(sourceRoot, slug);
    const sourceFile = resolveArticleSourceFile(sourceDir, sourceRoot, `Article entry "${slug}"`);
    if (!sourceFile) continue;

    const raw = fs.readFileSync(sourceFile, 'utf8');
    validateArticleContent(slug, raw);
    const parsed = matter(raw);
    validateFrontmatterImageFields(slug, parsed.data);
    if (!isPublishedArticle(parsed.data)) continue;

    const data = { ...parsed.data, categories: toCategories(parsed.data) };
    delete data.category;
    delete data.tags;

    const targetDir = path.join(targetRoot, slug);
    fs.mkdirSync(targetDir, { recursive: true });
    copyDir(sourceDir, targetDir);
    fs.writeFileSync(path.join(targetDir, 'index.mdx'), matter.stringify(parsed.content, data));
    synced += 1;
  }

  console.log(`Synced ${synced} published articles from taopedia-articles`);
}

// Only run the sync when executed directly, so tests can import the validators.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
