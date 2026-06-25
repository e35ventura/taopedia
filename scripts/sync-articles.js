import fs from 'fs';
import path from 'path';
import matter from './frontmatter.js';
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

// Invisible bidi marks and zero-width characters complete the Trojan-Source /
// invisible-character family the bidiControlPattern above guards: the LEFT-TO-
// RIGHT MARK (U+200E), RIGHT-TO-LEFT MARK (U+200F) and ARABIC LETTER MARK
// (U+061C) are invisible directional marks the embedding/override/isolate-only
// bidiControlPattern misses, and the ZERO WIDTH SPACE (U+200B), WORD JOINER
// (U+2060) and ZERO WIDTH NO-BREAK SPACE / BOM (U+FEFF) render nothing at all.
// All six are invisible in glossary prose and let an author split or hide text:
// e.g. a scam wallet address "5Grw<U+200B>kHvr..." reads normally but a zero-width
// space breaks naive address-pattern detection, and a stray BOM/word-joiner can
// fragment a flagged term. English glossary prose never needs any of them. The
// joiners U+200C/U+200D and variation selectors are deliberately NOT included so
// legitimate emoji and complex-script sequences keep working. Written as \uXXXX
// escapes so this rule stays invisible-character-free itself.
const invisibleFormatCharPattern = /[\u061c\u200b\u200e\u200f\u2060\ufeff]/;

// C0/C1 control characters and DEL are non-printable bytes with no place in
// rendered glossary prose: most are invisible, and an injected one can hide or
// disrupt text the way the zero-width characters above do (e.g. a form feed or a
// C1 control byte splits a flagged term or wallet address while rendering as
// nothing). The sanitizer already strips this exact class - C0 (<=U+001F), DEL
// (U+007F) and C1 (U+0080-U+009F) - when scanning URLs for obfuscated schemes
// (stripUrlObfuscationChars); this extends the same protection to article prose.
// TAB (U+0009), LINE FEED (U+000A) and CARRIAGE RETURN (U+000D) are excluded so
// normal Markdown whitespace passes. The class is built from code points via
// String.fromCharCode so this rule contains no literal control bytes itself.
const controlCharPattern = new RegExp(
  '[' +
    [[0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f]]
      .map(([lo, hi]) => String.fromCharCode(lo) + '-' + String.fromCharCode(hi))
      .join('') +
  ']',
);

// Additional invisible format characters beyond the zero-width batch above:
// SOFT HYPHEN (U+00AD) renders nothing except an optional hyphen at a line break,
// the invisible math operators FUNCTION APPLICATION / INVISIBLE TIMES / SEPARATOR
// / PLUS (U+2061-U+2064), the Unicode format characters INHIBIT/ACTIVATE SYMMETRIC
// SWAPPING / INHIBIT/ACTIVATE ARABIC FORM SHAPING / NATIONAL/NOMINAL DIGIT SHAPES
// (U+206A-U+206F), COMBINING GRAPHEME JOINER (U+034F), the MONGOLIAN VOWEL SEPARATOR
// (U+180E), and the Hangul fillers (U+115F, U+1160, U+3164, U+FFA0) all render as nothing in Latin prose. Like the
// zero-width characters already blocked, an injected one can split a flagged term or
// wallet address for detection-evasion while reading normally, and none has any use
// in the glossary English prose Markdown emits. Built from code points (no literal
// invisible bytes in source), matching controlCharPattern.
const additionalInvisibleCharPattern = new RegExp(
  '[' +
    [0x00ad, 0x034f, 0x115f, 0x1160, 0x180e, 0x2061, 0x2062, 0x2063, 0x2064, 0x3164, 0xffa0]
      .map((code) => String.fromCharCode(code))
      .join('') +
    String.fromCharCode(0x206a) +
    '-' +
    String.fromCharCode(0x206f) +
  ']',
);

// Unicode TAG characters (U+E0000-U+E007F) and the INTERLINEAR ANNOTATION anchors
// (U+FFF9 ANCHOR, U+FFFA SEPARATOR, U+FFFB TERMINATOR) are invisible format code
// points that render no glyph at all. The tag block is the canonical "ASCII
// smuggling" vector — an attacker encodes hidden text or instructions entirely in
// tag characters that ride inside visible prose completely unseen (e.g. a hidden
// payload trailing a normal sentence, invisible to a human reviewer but present in
// the stored/copied text and to any downstream consumer); interlinear annotation
// controls are likewise invisible with no rendered output. Neither has any use in
// the glossary English prose Markdown emits, so block them like the zero-width /
// control / format characters above. Written with \u{...} escapes (the `u` flag is
// required for the astral tag-character range) so no literal invisible byte enters
// this source.
const invisibleSmugglingCharPattern = /[\u{FFF9}-\u{FFFB}\u{E0000}-\u{E007F}]/u;

// LINE SEPARATOR (U+2028) and PARAGRAPH SEPARATOR (U+2029) are invisible, no-glyph
// format characters a browser treats as a line/paragraph break. Like the zero-width
// characters above, an injected one splits a flagged term or wallet address
// invisibly (it reads as a normal line wrap but breaks naive substring/address
// detection) and forces an unexpected break mid-prose. Markdown produces paragraph
// breaks from blank lines, never from raw U+2028/U+2029, so neither has any use in
// the glossary English prose it emits. Built from code points with
// String.fromCharCode (no literal separator byte in this source), matching
// additionalInvisibleCharPattern.
const separatorFormatCharPattern = new RegExp(
  '[' + [0x2028, 0x2029].map((code) => String.fromCharCode(code)).join('') + ']',
);

const unsafeContentPatterns = [
  { pattern: /^\s*import\s/m, reason: 'MDX imports are not allowed in article content' },
  { pattern: /^\s*export\s/m, reason: 'MDX exports are not allowed in article content' },
  { pattern: /<\s*script[\s>]/i, reason: 'script tags are not allowed in article content' },
  { pattern: /<\s*\/\s*script\s*>/i, reason: 'script tags are not allowed in article content' },
  // <applet> embeds and runs a legacy Java applet — the same active-content /
  // code-execution / embedding threat as the already-blocked <object> / <embed> /
  // <iframe>. Grouped with the active-embedding family it belongs to.
  { pattern: /<\s*(base|frame|frameset|iframe|object|embed|applet|link|meta|style|form|input|button|textarea|select|option|optgroup|fieldset|legend|datalist|output|label|menu|menuitem)\b/i, reason: 'active HTML elements are not allowed in article content' },
  // <dialog open> renders in the browser top layer -- above all page content, with
  // a backdrop -- with no script and no inline style. That makes a raw <dialog> a
  // clickjacking/phishing overlay primitive (e.g. a fake "wallet compromised" modal
  // covering the article). Article bodies never need it, so block the element.
  { pattern: /<\s*dialog\b/i, reason: 'dialog elements are not allowed in article content' },
  // <details>/<summary> expose interactive disclosure panels in article bodies with
  // no script and no inline style — the same unwanted interactive surface as dialog.
  { pattern: /<\s*details\b/i, reason: 'details elements are not allowed in article content' },
  { pattern: /<\s*summary\b/i, reason: 'summary elements are not allowed in article content' },
  // <search> exposes the implicit `search` landmark to assistive technology — an
  // injected one adds a fake "search" region to the AT landmark list (e.g. a
  // spoofed "search" area steering a screen-reader user to attacker-chosen content),
  // the element-level form of the already-blocked role= landmark spoof (role= is an
  // attribute, so it cannot cover the implicit landmark <search> provides). A
  // glossary's prose never marks its own search regions — the site exposes search
  // through its own layout component — so block the element.
  { pattern: /<\s*search\b/i, reason: 'search elements are not allowed in article content' },
  // <nav>/<aside>/<main>/<header>/<footer> expose implicit ARIA landmarks
  // (navigation, complementary, main, banner, contentinfo) to assistive technology
  // — like <search> above, an injected one in article content adds a spoofed
  // landmark region to the AT landmark list (e.g. a fake "navigation" or "main"
  // region steering a screen-reader user, navigating by landmark, to attacker-chosen
  // content). role= (already blocked) is an attribute and cannot cover the implicit
  // landmark these elements provide. A glossary's article body is plain prose — these
  // page-layout landmarks come from the site template, never from article Markdown.
  { pattern: /<\s*(nav|aside|main|header|footer)\b/i, reason: 'landmark elements (nav, aside, main, header, footer) are not allowed in article content' },
  // <section> and <article> are the generic sectioning-content elements: each
  // starts a new document section/outline node, and <section> with an accessible
  // name (or <article>) is exposed to assistive technology as a "region"/"article"
  // landmark — the same implicit-landmark / outline spoof the nav/aside/main/header/
  // footer block above guards. An injected <article>/<section> forges the article's
  // structure for a screen-reader user navigating by region or heading outline. A
  // glossary's article body is plain prose built from Markdown headings; Markdown
  // emits <h1>-<h6>/<p>, never a raw <section> or <article>, so the site template's
  // own sectioning is unaffected.
  { pattern: /<\s*(section|article)\b/i, reason: 'sectioning elements (section, article) are not allowed in article content' },
  // <data value="…"> and <time datetime="…"> carry a machine-readable value that a
  // scraper, screen reader, or "copy value" affordance reads instead of, and
  // independently from, the visible text — so an injected one makes the machine-read
  // value diverge from what the reader sees (e.g. <time datetime="2099-01-01">2020
  // </time>, or <data value="https://evil.example">official site</data>). Same
  // machine-readable-text / auxiliary-spoof class the title= and aria-label /
  // aria-describedby attributes are already blocked for. Glossary prose carries no
  // machine values. The \b anchor leaves the already-blocked <datalist> untouched.
  { pattern: /<\s*(data|time)\b/i, reason: 'data and time elements are not allowed in article content' },
  // <hgroup> wraps a heading with adjacent content into a single heading group. An
  // injected one restructures the article's heading outline — absorbing following
  // prose into a heading group or altering the heading hierarchy that assistive
  // technology, "jump to heading" navigation, and document-outline tools rely on,
  // so attacker text can be presented as part of a heading's structure. A glossary's
  // headings are emitted by Markdown and never wrapped in <hgroup>, so block it like
  // the other non-prose structural elements (search/dialog/details).
  { pattern: /<\s*hgroup\b/i, reason: 'hgroup elements are not allowed in article content' },
  // <article>/<section> are sectioning-content roots. An injected one opens a new
  // section in the document outline (and <article> additionally carries an implicit
  // role=article landmark that assistive technology announces and "jump to landmark"
  // navigation lands on), restructuring the outline and landmark tree the same way
  // the blocked <hgroup> restructures the heading outline — letting attacker prose
  // present itself as its own article/section region — with no script, handler, or
  // flagged scheme. A glossary article is a single section of Markdown prose and
  // never nests its own sectioning roots, so block them like <hgroup>.
  { pattern: /<\s*(article|section)\b/i, reason: 'article and section elements are not allowed in article content' },
  // <template> parses its contents into an inert document fragment rather than the
  // live DOM. That makes it a DOM-clobbering / mutation-XSS surface (named elements
  // inside can shadow `document.<name>` globals, and the hidden subtree is a known
  // sanitizer-evasion trick), with no rendered output a reader would ever want in
  // glossary prose. Block the element outright, like the other parsing-context tags.
  { pattern: /<\s*template\b/i, reason: 'template elements are not allowed in article content' },
  // <slot> is the shadow-DOM content-placeholder element — the element form of the
  // already-blocked slot= attribute. A named <slot name="…"> is a DOM-clobbering /
  // sanitizer-confusion surface that parsers and sanitizers (DOMPurify) special-case,
  // the same parsing-context / DOM-clobbering class blocked above for <template>. A
  // glossary's plain-prose Markdown body never emits it.
  { pattern: /<\s*slot\b/i, reason: 'slot elements are not allowed in article content' },
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
  { pattern: /<\s*(video|audio|track)\b/i, reason: 'media elements are not allowed in article content' },
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
  // handler / scheme scans alone. <foreignObject> (SVG) and <annotation-xml>
  // (MathML) are the HTML integration points: with encoding="text/html" the
  // parser re-enters HTML mode inside <annotation-xml>, the canonical MathML
  // mutation-XSS / sanitizer-bypass vector (the MathML counterpart of
  // foreignObject), so they are blocked standalone too.
  { pattern: /<\s*(svg|math|foreignObject|annotation-xml)\b/i, reason: 'SVG and MathML elements are not allowed in article content' },
  // <maction> is the MathML interactive element: actiontype="toggle" makes clicking
  // cycle through sub-expressions, and actiontype="statusline"/"tooltip" shows
  // attacker-controlled text on interaction — an unwanted interactive surface in
  // article prose, the same class as the blocked <dialog>/<details>/<summary>
  // disclosure elements. Like <annotation-xml>, block it standalone so it is caught
  // even if the <math> root that hosts it is split off; a glossary's prose never
  // embeds interactive MathML.
  { pattern: /<\s*maction\b/i, reason: 'maction elements are not allowed in article content' },
  // <animate>/<animateTransform>/<animateMotion>/<set> are the SVG animation
  // elements the rule above warns about ("animation elements that retarget
  // attributes"): they mutate an existing element's attribute (e.g. animate an
  // href/xlink:href or style to a new value after render), a classic mutation-XSS
  // / sanitizer-evasion vector. <use> clones and references another subtree.
  // <discard> removes a target element at a point on the animation timeline
  // (timeline-driven DOM mutation), and <mpath> references an external path via
  // href/xlink:href for <animateMotion> — the rest of the animation family. Like
  // standalone <foreignObject> / <annotation-xml>, block them on their own so they
  // are caught even if the <svg>/<math> root that hosts them is split off.
  { pattern: /<\s*(animate|animateTransform|animateMotion|set|use|discard|mpath)\b/i, reason: 'SVG animation and use sub-elements are not allowed in article content' },
  // <image> (SVG) and <feImage> (SVG filter primitive) load an external resource
  // via href/xlink:href. Because they are SVG-namespaced -- not the HTML <img>
  // element -- they bypass the img-src and URL-scheme checks the sanitizer applies
  // to <img>, so an injected one is a no-script external-resource / tracking-beacon
  // load (and content-injection surface). Same external-load threat class as the
  // <picture>/<source> block above. Like the SVG animation/use sub-elements, block
  // them standalone so they are caught even if the <svg> root is split off.
  { pattern: /<\s*(image|feImage)\b/i, reason: 'SVG image and feImage sub-elements are not allowed in article content' },
  // <mglyph> is the MathML counterpart: it renders a non-standard math symbol by
  // loading an external image via its src/xlink:href, outside the HTML <img>
  // src/scheme checks -- the same no-script external-resource / tracking-beacon
  // load as the SVG <image>/<feImage> block above. <mglyph> is only valid inside
  // <math> (already blocked), but block it standalone too so it is caught even if
  // the <math> root that hosts it is split off, like the other svg/math sub-elements.
  { pattern: /<\s*mglyph\b/i, reason: 'MathML mglyph sub-elements are not allowed in article content' },
  // <clipPath>/<mask>/<filter>/<marker>/<symbol> are the SVG paint-server and
  // reference-container sub-elements: <symbol>/<marker> are cloned and referenced by
  // id like <use>, and <clipPath>/<mask>/<filter> are paint servers / effect
  // containers applied via url(#…) that host filter primitives such as the already-
  // blocked <feImage> external-resource loader. Same SVG sub-element class (reference
  // / clone / rendering-manipulation) as the <use>/<animate> and <image>/<feImage>
  // blocks above; block them standalone so they are caught even if the <svg> root is
  // split off. A glossary's plain-prose Markdown body never authors raw SVG.
  { pattern: /<\s*(clipPath|mask|filter|marker|symbol)\b/i, reason: 'SVG paint-server and reference sub-elements are not allowed in article content' },
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
  // <ruby>/<rt>/<rp> (and <rtc>/<rb>) render interlinear annotation text — small
  // type positioned directly above (or beside) the base text. An injected
  // `<ruby>5Fake…address<rt>✓ official</rt></ruby>` overlays an attacker-chosen
  // micro-label like "✓ official" on top of a scam address with no script, inline
  // style, or flagged scheme — a content-spoof / fake-trust-mark primitive in the
  // same class as the merged marquee/bdo/<font> rendered-element blocks. Bittensor
  // glossary prose is single-script English and never uses ruby annotations, so
  // block the whole ruby element family.
  { pattern: /<\s*(ruby|rt|rp|rtc|rb)\b/i, reason: 'ruby annotation elements are not allowed in article content' },
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
  { pattern: invisibleFormatCharPattern, reason: 'invisible bidi marks and zero-width characters are not allowed in article content' },
  { pattern: controlCharPattern, reason: 'control characters are not allowed in article content' },
  { pattern: additionalInvisibleCharPattern, reason: 'invisible format characters are not allowed in article content' },
  { pattern: invisibleSmugglingCharPattern, reason: 'invisible tag and annotation characters are not allowed in article content' },
  { pattern: separatorFormatCharPattern, reason: 'invisible line and paragraph separator characters are not allowed in article content' },
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
// ping= is the same no-JS tracking-beacon family as the merged ping block (#419) —
// quoted-value abutted forms (e.g. `href="x"ping="https://evil/track"`) slipped the
// whitespace-delimited `\sping=` scan and reached the rendered article.
const nonSpaceDelimitedInteractionSurfaceAttrPattern =
  /<[^>]*[/"'`](?:contenteditable|tabindex|draggable|download|popover|usemap|accesskey|referrerpolicy|dir|ping|inert)\s*=/i;

// align/valign/bgcolor/background/border/cellpadding/cellspacing/hspace/vspace
// are blocked in the whitespace-delimited scan above (the merged #435/#438/etc.
// blocks), but the same quote-abutted bypass used by contenteditable —
// `<img src="x"align="top">` or `<table src="x"border="5">` after a prior
// quoted attribute — slipped those `\s…=` scans. Same presentational-layout
// spoof class as the merged whitespace-delimited blocks; add them to a single
// non-space-delimited alternation so any `[/"\'`]` boundary before the
// attribute name is caught (still runs over emptyQuotedAttributeValues() so
// benign URLs / class values pass).
//
// style= is included too — the existing `\sstyle\s*=` scan at line 169 only
// catches the whitespace-delimited form, leaving the quote-/slash-/backtick-
// abutted forms (e.g. `<img src="x"style="background:url(//evil/?leak)">`,
// `<img src=x/style="position:fixed">`, `<img src=\`x\`style="color:red">`)
// as a real no-JS data-exfiltration / clickjacking gap. style is the worst
// allowed element to miss because it carries every CSS primitive that the
// merged style comment already lists (CSS background beacons, fixed-position
// overlays, content spoofing) — same presentational-injection family as the
// rest of this alternation, so it lives in the same scan and error message.
const nonSpaceDelimitedPresentationalLayoutAttrPattern =
  /<[^>]*[/"'`](?:style|align|valign|bgcolor|background|border|cellpadding|cellspacing|hspace|vspace)\s*=/i;

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

// width=/span= on allowed <col>/<colgroup> size and stretch table columns without
// the blocked inline style= attribute — the last table-family elements left after
// the merged dimension surface walked <table>/<td>/<th> (#465) and <tr>/<hr>/<pre>.
// A <colgroup><col width="5000"></colgroup> reserves an oversized column that
// collapses the rest of the table and pushes the article body off-screen, and
// <col span="99"> / <colgroup span="99"> stretches one column definition across the
// whole table, distorting its layout — a content-layout spoof with no script,
// handler, or flagged scheme. Same layout-defacement class as the merged
// #438 / #451 / #465 rules. Tag-scoped to col/colgroup and scanned on
// emptyQuotedAttributeValues() so benign prose or class values mentioning
// "width"/"span" pass.
const colDimensionAttrPattern = /<\s*(?:col|colgroup)\b[^>]*\s(?:width|span)\s*=/i;
const nonSpaceDelimitedColDimensionAttrPattern = /<\s*(?:col|colgroup)\b[^>]*[/"'`](?:width|span)\s*=/i;

// autofocus steals keyboard focus on page load — a focus-theft primitive on allowed
// elements with no script. Tag-boundary lookahead catches autofocus before another
// attribute (<div autofocus class="x">). parse5 also treats `<div/autofocus>`,
// `<div /autofocus>`, and `<div class="x"/autofocus>` as a real bare autofocus
// attribute, so those slash-boundary forms must be blocked too. Do NOT widen this
// to every `/autofocus` substring: `<div class=x/autofocus>` remains a class value.
const autofocusAttrPattern = /<[^>]*\sautofocus(?=[\s>/=])/i;
const quoteAbuttedAutofocusAttrPattern = /<[^>]*["'`]autofocus(?=[\s>/=])/i;
const tagNameSlashDelimitedAutofocusAttrPattern = /<\s*[a-z][\w:-]*\/autofocus(?=[\s>/=])/i;
const whitespaceSlashDelimitedAutofocusAttrPattern = /<[^>]*\s\/autofocus(?=[\s>/=])/i;
const quoteSlashDelimitedAutofocusAttrPattern = /<[^>]*["'`]\/autofocus(?=[\s>/=])/i;

// contenteditable's value forms (contenteditable="true") are blocked above, but the
// BARE form `<p contenteditable>` is the editable ("true") state per the HTML spec
// (empty string maps to true) with no value — so the `=`-anchored value scans miss
// it, leaving a real in-article editing surface (content-spoofing / UI-redress).
// parse5 also treats `<p/contenteditable>`, `<p /contenteditable>`, and
// `<p class="x"/contenteditable>` as a real bare contenteditable attribute, so the
// slash-boundary presence forms must be blocked too — the same presence-form
// coverage already merged for autofocus/hidden/inert/itemscope. Do NOT widen to
// every `/contenteditable` substring: `<p class=x/contenteditable>` stays a value.
const contenteditableAttrPattern = /<[^>]*\scontenteditable(?=[\s>/=])/i;
const quoteAbuttedContenteditableAttrPattern = /<[^>]*["'`]contenteditable(?=[\s>/=])/i;
const tagNameSlashDelimitedContenteditableAttrPattern = /<\s*[a-z][\w:-]*\/contenteditable(?=[\s>/=])/i;
const whitespaceSlashDelimitedContenteditableAttrPattern = /<[^>]*\s\/contenteditable(?=[\s>/=])/i;
const quoteSlashDelimitedContenteditableAttrPattern = /<[^>]*["'`]\/contenteditable(?=[\s>/=])/i;

// hidden on allowed elements removes content from layout but keeps it in the DOM —
// an injected <a hidden href="…"> is still a navigable link with no script.
// Same tag-boundary / quote-abutted detection as autofocus, plus the parser-backed
// slash-boundary forms (`<div/hidden>`, `<div /hidden>`, `<div class="x"/hidden>`).
const hiddenAttrPattern = /<[^>]*\shidden(?=[\s>/=])/i;
const quoteAbuttedHiddenAttrPattern = /<[^>]*["'`]hidden(?=[\s>/=])/i;
const tagNameSlashDelimitedHiddenAttrPattern = /<\s*[a-z][\w:-]*\/hidden(?=[\s>/=])/i;
const whitespaceSlashDelimitedHiddenAttrPattern = /<[^>]*\s\/hidden(?=[\s>/=])/i;
const quoteSlashDelimitedHiddenAttrPattern = /<[^>]*["'`]\/hidden(?=[\s>/=])/i;

// download on an allowed <a> turns a normal-looking link into a drive-by file
// download even without a value (`<a download href="...">`). The existing
// interaction-surface scan above already blocks the value form (`download=` and
// quote-/slash-abutted variants); these boolean patterns close the remaining
// presence-only form. parse5 also treats `<a/download>`, `<a /download>`, and
// `<a class="x"/download>` as a real bare download attribute, so slash-boundary
// forms must be blocked too. Do NOT widen this to every `/download` substring:
// `<a class=x/download href="...">` remains a class value.
const downloadAttrPattern = /<[^>]*\sdownload(?=[\s>/=])/i;
const quoteAbuttedDownloadAttrPattern = /<[^>]*["'`]download(?=[\s>/=])/i;
const tagNameSlashDelimitedDownloadAttrPattern = /<\s*[a-z][\w:-]*\/download(?=[\s>/=])/i;
const whitespaceSlashDelimitedDownloadAttrPattern = /<[^>]*\s\/download(?=[\s>/=])/i;
const quoteSlashDelimitedDownloadAttrPattern = /<[^>]*["'`]\/download(?=[\s>/=])/i;

// popover on an allowed element renders a native top-layer overlay even when
// omitted its explicit value (`<div popover>...</div>` parses as the auto
// state). The existing interaction-surface scan above already blocks
// `popover=`; these patterns close the remaining presence-only form. parse5
// also treats `<div/popover>`, `<div /popover>`, and `<div class="x"/popover>`
// as a real bare `popover` attribute, so slash-delimited tag-boundary forms
// must be blocked too. Do NOT widen this to every `/popover` substring:
// `<div class=x/popover>` remains a class value, not an attribute.
const popoverAttrPattern = /<[^>]*\spopover(?=[\s>/=])/i;
const quoteAbuttedPopoverAttrPattern = /<[^>]*["'`]popover(?=[\s>/=])/i;
const tagNameSlashDelimitedPopoverAttrPattern = /<\s*[a-z][\w:-]*\/popover(?=[\s>/=])/i;
const whitespaceSlashDelimitedPopoverAttrPattern = /<[^>]*\s\/popover(?=[\s>/=])/i;
const quoteSlashDelimitedPopoverAttrPattern = /<[^>]*["'`]\/popover(?=[\s>/=])/i;

// inert= on an allowed element is a clickjacking / focus-hijack surface: it removes
// the element from the tab order and pointer events, so an injected <a inert
// href="https://evil/"> or <form inert>…</form> renders as visible "disabled-looking"
// content that the reader can still middle-click (link) or focus via assistive tech
// — a no-script content-spoofing primitive. inert is a boolean attribute, so the
// lookahead is the same `(?=[\s>/=])` shape autofocus/hidden use. Same interaction-
// surface family as the merged contenteditable/tabindex/draggable/popover/accesskey
// blocks. parse5 also treats `<div/inert>`, `<div /inert>`, and
// `<div class="x"/inert>` as a real bare inert attribute, so slash-boundary forms
// must be blocked too. Do NOT widen this to every `/inert` substring:
// `class="x/inert"` remains a class value.
const inertAttrPattern = /<[^>]*\sinert(?=[\s>/=])/i;
const quoteAbuttedInertAttrPattern = /<[^>]*["'`]inert(?=[\s>/=])/i;
const tagNameSlashDelimitedInertAttrPattern = /<\s*[a-z][\w:-]*\/inert(?=[\s>/=])/i;
const whitespaceSlashDelimitedInertAttrPattern = /<[^>]*\s\/inert(?=[\s>/=])/i;
const quoteSlashDelimitedInertAttrPattern = /<[^>]*["'`]\/inert(?=[\s>/=])/i;

// aria-label=/aria-labelledby= override an allowed element's accessible name.
// On links and images this can make screen-reader output differ from the visible
// text or destination (e.g. a visible "claim TAO" link announced as "official
// staking guide"), a no-script content-spoofing surface. Article prose does not
// need custom accessible names, so block the name-overriding ARIA attributes
// while leaving ordinary prose and URL/class substrings alone.
const ariaNameAttrPattern = /<[^>]*\saria-(?:label|labelledby)\s*=/i;
const nonSpaceDelimitedAriaNameAttrPattern = /<[^>]*[/"'`]aria-(?:label|labelledby)\s*=/i;

// title= on allowed elements sets the native hover tooltip — the same auxiliary-
// text spoof channel merged #501 closed for aria-label/aria-labelledby. A visible
// "View official docs" link with title="Paste your seed phrase at evil.example"
// shows attacker-chosen text on hover with no script or flagged scheme. Glossary
// prose never needs title tooltips, so block the attribute alongside ARIA names.
const titleAttrPattern = /<[^>]*\stitle\s*=/i;
const nonSpaceDelimitedTitleAttrPattern = /<[^>]*[/"'`](?:title)\s*=/i;

// aria-describedby= points assistive tech at extra description text that can
// differ from visible article content — completing the auxiliary-text spoof
// family merged #501 (aria-label/aria-labelledby) and #550 (title) closed.
const ariaDescribedbyAttrPattern = /<[^>]*\saria-describedby\s*=/i;
const nonSpaceDelimitedAriaDescribedbyAttrPattern = /<[^>]*[/"'`](?:aria-describedby)\s*=/i;

// role= overrides an element's accessibility semantics — e.g. role="alert" makes
// assistive tech announce injected text as an urgent live region, and role="button"
// on a link changes how it is presented. Same accessibility-spoof family as merged
// #501, #550, and #553. Glossary prose never needs custom roles.
const roleAttrPattern = /<[^>]*\srole\s*=/i;
const nonSpaceDelimitedRoleAttrPattern = /<[^>]*[/"'`](?:role)\s*=/i;

// aria-hidden= removes subtrees from the accessibility tree while leaving them
// visible in the layout — a dual-audience spoof: sighted readers see injected
// warnings or disclaimers that screen-reader users never hear (or vice versa).
// Same accessibility-spoof family as merged #501, #550, #553, and #554.
const ariaHiddenAttrPattern = /<[^>]*\saria-hidden\s*=/i;
const nonSpaceDelimitedAriaHiddenAttrPattern = /<[^>]*[/"'`](?:aria-hidden)\s*=/i;

// aria-live=/aria-atomic= turn injected markup into live regions that interrupt
// assistive tech with attacker-chosen text — the attribute counterpart to merged
// #554 role="alert". aria-live="assertive" announces immediately; aria-atomic="true"
// forces the whole region to be read. Glossary prose never needs live regions.
const ariaLiveRegionAttrPattern = /<[^>]*\saria-(?:live|atomic)\s*=/i;
const nonSpaceDelimitedAriaLiveRegionAttrPattern = /<[^>]*[/"'`](?:aria-(?:live|atomic))\s*=/i;

// aria-controls=/aria-expanded= fake disclosure widgets in assistive tech — e.g.
// aria-expanded="true" reports an injected link as an open panel, and aria-controls
// points AT at attacker-chosen element ids. Same accessibility-spoof family as
// merged #558 (aria-live), #556 (aria-hidden), and #554 (role). <details> is
// already element-blocked; these are the attribute-only disclosure primitives.
const ariaDisclosureAttrPattern = /<[^>]*\saria-(?:controls|expanded)\s*=/i;
const nonSpaceDelimitedAriaDisclosureAttrPattern = /<[^>]*[/"'`](?:aria-(?:controls|expanded))\s*=/i;

// aria-roledescription= overrides the default accessible role description that
// assistive technology announces for an element — e.g.
// aria-roledescription="Security Alert" makes a screen reader announce a plain
// paragraph as a "Security Alert" instead of its actual role. Unlike obsolete
// presentational attributes, aria-roledescription is a current WAI-ARIA 1.1+
// attribute actively supported by NVDA, JAWS, and VoiceOver: injecting it into
// article content lets an attacker make phishing blocks sound like trusted system
// UI to screen-reader users. Same accessibility-spoof family as merged role
// (#554), aria-label (#501), aria-describedby (#553), aria-hidden (#556),
// aria-live (#558), and aria-controls (#559). Glossary articles never set custom
// role descriptions — the site's components handle semantics via standard HTML.
const ariaRoledescriptionAttrPattern = /<[^>]*\saria-roledescription\s*=/i;
const nonSpaceDelimitedAriaRoledescriptionAttrPattern = /<[^>]*[/"'`](?:aria-roledescription)\s*=/i;

// aria-flowto= overrides the default reading order that assistive technology
// follows after the current element — e.g. aria-flowto="evil-panel" redirects
// a screen reader from the article body to an attacker-injected phishing block.
// Unlike the visual document flow (which users see), aria-flowto silently
// reroutes the non-visual navigation path, making it a navigation-hijack
// primitive for AT users. Same accessibility-spoof family as merged role (#554),
// aria-label (#501), aria-describedby (#553), aria-hidden (#556), aria-live
// (#558), aria-controls (#559), and aria-roledescription (#561). Glossary
// articles never set custom reading order — the site relies on standard DOM
// order for accessible navigation.
const ariaFlowtoAttrPattern = /<[^>]*\saria-flowto\s*=/i;
const nonSpaceDelimitedAriaFlowtoAttrPattern = /<[^>]*[/"'`](?:aria-flowto)\s*=/i;

// aria-keyshortcuts= declares keyboard shortcuts that activate or focus an
// element — e.g. aria-keyshortcuts="Alt+S" makes assistive technology announce
// a fake shortcut for an injected phishing link or button, lending it false
// platform-integration authority ("press Alt+S to verify your wallet").  The
// attribute is a current WAI-ARIA 1.1+ property with full screen-reader
// support (NVDA, JAWS, VoiceOver).  Same accessibility-spoof family as merged
// role (#554), aria-label (#501), aria-describedby (#553), aria-hidden (#556),
// aria-live (#558), aria-controls (#559), aria-roledescription (#561), and
// aria-flowto (#564).  Glossary articles never declare keyboard shortcuts —
// the site handles all keyboard interaction in its own layout scripts.
const ariaKeyshortcutsAttrPattern = /<[^>]*\saria-keyshortcuts\s*=/i;
const nonSpaceDelimitedAriaKeyshortcutsAttrPattern = /<[^>]*[/"'`](?:aria-keyshortcuts)\s*=/i;

// aria-current= marks an element as the "current" item within a set — e.g.
// aria-current="page" makes assistive technology announce an injected link as
// the current page, lending false navigational authority to attacker-chosen
// destinations (a phishing / authority-spoof primitive).  Same accessibility-
// attribute family as merged #567 (aria-keyshortcuts), #564 (aria-flowto),
// #561 (aria-roledescription), #559 (aria-controls), #558 (aria-live), #556
// (aria-hidden), #554 (role), #553 (aria-describedby), #550 (title), and #501
// (aria-label).  Glossary articles never mark their own current-page state —
// the site layout handles that in the navigation component.
const ariaCurrentAttrPattern = /<[^>]*\saria-current\s*=/i;
const nonSpaceDelimitedAriaCurrentAttrPattern = /<[^>]*[/"'`](?:aria-current)\s*=/i;

// aria-errormessage= associates an element with a custom error message
// element — e.g. aria-errormessage="fake-error" makes assistive technology
// announce injected error text when the element enters an invalid state,
// lending false urgency or credibility to attacker-chosen content (a phishing
// / authority-spoof primitive).  Same accessibility-attribute family as merged
// #568 (aria-current), #567 (aria-keyshortcuts), #564 (aria-flowto), #561
// (aria-roledescription), #559 (aria-controls), #558 (aria-live), #556
// (aria-hidden), #554 (role), #553 (aria-describedby), #550 (title), and #501
// (aria-label).  Glossary articles never associate custom error messages —
// the site has no form validation that would require them.
const ariaErrormessageAttrPattern = /<[^>]*\saria-errormessage\s*=/i;
const nonSpaceDelimitedAriaErrormessageAttrPattern = /<[^>]*[/"'`](?:aria-errormessage)\s*=/i;

// aria-owns= reparents elements in the accessibility tree — e.g.
// aria-owns="site-nav" makes assistive technology present the site's real
// navigation as a child of the attacker's injected element, enabling
// AT-level content/structure spoofing without any visual change.  Same
// accessibility-attribute family as merged #570 (aria-errormessage), #568
// (aria-current), #567 (aria-keyshortcuts), #564 (aria-flowto), #561
// (aria-roledescription), #559 (aria-controls), #558 (aria-live), #556
// (aria-hidden), #554 (role), #553 (aria-describedby), #550 (title), and #501
// (aria-label).  Glossary articles never reparent accessibility tree nodes —
// the site has no composite widgets that require ownership reassignment.
const ariaOwnsAttrPattern = /<[^>]*\saria-owns\s*=/i;
const nonSpaceDelimitedAriaOwnsAttrPattern = /<[^>]*[/"'`](?:aria-owns)\s*=/i;

// HTML microdata attributes (itemscope, itemtype, itemprop, itemref, itemid)
// inject Schema.org structured data into the rendered article body — same
// content-spoof class as the merged aria-* blocks. Taopedia owns structured
// data via the JSON-LD graph in src/components/StructuredData.astro, so prose
// must not emit its own microdata. Same dual-pattern shape (whitespace +
// quote/slash-abutted) as the merged aria-name / contenteditable / style
// blocks. itemscope is boolean and uses the [\s>/=] lookahead. parse5 also
// treats `<div/itemscope>`, `<div /itemscope>`, and `<div class="x"/itemscope>`
// as a real bare itemscope attribute, so those slash-boundary forms must be
// blocked too. Do NOT widen this to every `/itemscope` substring:
// `<div class=x/itemscope>` remains a class value.
const microdataAttrPattern = /<[^>]*\s(?:itemscope|itemtype|itemprop|itemref|itemid)(?=[\s>/=])/i;
const nonSpaceDelimitedMicrodataAttrPattern = /<[^>]*[/"'`](?:itemtype|itemprop|itemref|itemid)\s*=/i;
const quoteAbuttedItemscopePattern = /<[^>]*["'`]itemscope(?=[\s>/=])/i;
const tagNameSlashDelimitedItemscopePattern = /<\s*[a-z][\w:-]*\/itemscope(?=[\s>/=])/i;
const whitespaceSlashDelimitedItemscopePattern = /<[^>]*\s\/itemscope(?=[\s>/=])/i;
const quoteSlashDelimitedItemscopePattern = /<[^>]*["'`]\/itemscope(?=[\s>/=])/i;

// aria-busy= marks a region as updating in assistive technology — e.g.
// aria-busy="true" makes screen readers announce "loading" for injected prose
// even though glossary articles are static HTML with no live update channel.
// <meter>/<progress> are already element-blocked (#156); aria-busy is the
// remaining status-spoof path for AT users. Same accessibility-attribute
// family as merged #578 (microdata), #571 (aria-owns), and #568 (aria-current).
const ariaBusyAttrPattern = /<[^>]*\saria-busy\s*=/i;
const nonSpaceDelimitedAriaBusyAttrPattern = /<[^>]*[/"'`](?:aria-busy)\s*=/i;

// aria-valuenow=/aria-valuemin=/aria-valuemax=/aria-valuetext= fake range-widget
// values for assistive technology — e.g. aria-valuenow="100" with
// aria-valuetext="Wallet scan complete" announces a fake progress/slider reading
// on static prose, lending false legitimacy to an injected "100% verified"
// phishing block. The native <meter>/<progress> range widgets are already
// element-blocked (#156); these are the ARIA-attribute path to the same fake
// status/value readout. Same accessibility-attribute spoof family as merged
// aria-busy (#582), aria-disabled/readonly/required (#587), and toggle state
// (#583). Glossary articles never emit range-widget ARIA on static prose.
const ariaValueStateAttrPattern = /<[^>]*\saria-value(?:now|min|max|text)\s*=/i;
const nonSpaceDelimitedAriaValueStateAttrPattern =
  /<[^>]*[/"'`](?:aria-value(?:now|min|max|text))\s*=/i;

// aria-level=/aria-posinset=/aria-setsize= fake the document structure announced
// to assistive technology on allowed native elements. aria-level="1" on an
// allowed sub-heading (h2–h6) makes a screen reader announce it as a top-level
// heading, forging the article's outline; aria-posinset/aria-setsize on an
// allowed <li> fake a list position ("step 3 of 3"), making an injected step
// sound like the final action of a complete procedure. Same accessibility-state
// spoof family as the merged aria-value range attributes, aria-busy (#582), and
// the toggle/selection state block (#583). Glossary articles never set their own
// structural ARIA — heading level and list order come from the Markdown source.
const ariaStructureAttrPattern = /<[^>]*\saria-(?:level|posinset|setsize)\s*=/i;
const nonSpaceDelimitedAriaStructureAttrPattern =
  /<[^>]*[/"'`](?:aria-(?:level|posinset|setsize))\s*=/i;

// aria-colindex/colcount/colspan/rowindex/rowcount/rowspan (+ the *indextext
// variants) fake the table-grid position and dimensions a screen reader
// announces. These are the ARIA counterpart to the already-blocked native
// colspan=/rowspan= on table cells (#465): on an allowed <table>/<td>/<th> an
// injected aria-rowcount="500" or aria-colspan="9" makes AT announce a forged
// table size or a cell spanning columns it does not, distorting the structure a
// non-visual reader perceives — with no script, handler, or flagged scheme. Same
// accessibility-structure spoof family as the merged aria-level/posinset/setsize
// block. Glossary tables never set their own grid-position ARIA.
const ariaGridAttrPattern = /<[^>]*\saria-(?:col|row)(?:index(?:text)?|count|span)\s*=/i;
const nonSpaceDelimitedAriaGridAttrPattern =
  /<[^>]*[/"'`](?:aria-(?:col|row)(?:index(?:text)?|count|span))\s*=/i;

// aria-orientation=/aria-multiselectable= fake composite-widget semantics for
// assistive technology on static prose. aria-orientation announces a fabricated
// horizontal/vertical axis for a list/menu/toolbar, and aria-multiselectable
// announces that a list/grid accepts multiple selections — making read-only
// glossary content sound like an interactive control a non-visual reader can
// operate. Same accessibility-widget spoof family as the merged aria-value range
// attributes, the grid-position block, and the toggle/selection state block
// (#583). Glossary articles never expose composite-widget ARIA on static prose.
const ariaWidgetAttrPattern = /<[^>]*\saria-(?:orientation|multiselectable)\s*=/i;
const nonSpaceDelimitedAriaWidgetAttrPattern =
  /<[^>]*[/"'`](?:aria-(?:orientation|multiselectable))\s*=/i;

// aria-pressed=/aria-checked=/aria-selected= fake toggle and option state in
// assistive technology — e.g. aria-pressed="true" makes a link sound pressed,
// aria-selected="true" marks a list item as the chosen procedure step, and
// aria-checked="mixed" reports a fake partial-verification indicator. Same
// accessibility-state spoof family as merged #582 (aria-busy), #568
// (aria-current), and #559 (aria-expanded). Glossary articles never set widget
// toggle or selection state — the site layout handles that in its own components.
const ariaToggleStateAttrPattern = /<[^>]*\saria-(?:pressed|checked|selected)\s*=/i;
const nonSpaceDelimitedAriaToggleStateAttrPattern =
  /<[^>]*[/"'`](?:aria-(?:pressed|checked|selected))\s*=/i;

// aria-disabled=/aria-readonly=/aria-required= fake form-widget state in
// assistive technology — e.g. aria-disabled="true" makes a link sound inactive
// while it remains navigable, aria-required="true" announces a fake mandatory
// field, and aria-readonly="true" marks prose as an uneditable control. Same
// accessibility-state spoof family as merged #583 (toggle state), #582
// (aria-busy), #570 (aria-errormessage), and inert (#496). Glossary articles
// never emit form-field ARIA on static prose.
const ariaFormStateAttrPattern = /<[^>]*\saria-(?:disabled|readonly|required)\s*=/i;
const nonSpaceDelimitedAriaFormStateAttrPattern =
  /<[^>]*[/"'`](?:aria-(?:disabled|readonly|required))\s*=/i;

// aria-haspopup=/aria-modal= fake popup and modal-dialog state in assistive
// technology — e.g. aria-haspopup="menu" makes a benign link sound like it
// opens a submenu, and aria-modal="true" tells AT to treat the rest of the
// page as inert background, trapping a screen-reader user's focus inside an
// attacker-chosen element with no real dialog and no script. Same
// accessibility-state spoof family as merged #587 (aria-disabled/readonly/
// required), #583 (toggle state), and #582 (aria-busy). Glossary articles
// never emit popup or dialog ARIA on static prose — the site's own dialog
// components handle that.
const ariaPopupStateAttrPattern = /<[^>]*\saria-(?:haspopup|modal)\s*=/i;
const nonSpaceDelimitedAriaPopupStateAttrPattern =
  /<[^>]*[/"'`](?:aria-(?:haspopup|modal))\s*=/i;

// aria-invalid= fakes a validation-error state for assistive technology — e.g.
// aria-invalid="true" on injected prose announces a real paragraph as a field
// that "failed validation", and aria-invalid="spelling"/"grammar" reports a
// fake correction prompt. It is the remaining form-widget state attribute not
// yet blocked alongside the merged aria-disabled/aria-readonly/aria-required
// (#587) — the same accessibility-state spoof family as #583 (toggle state),
// #582 (aria-busy), and #570 (aria-errormessage, the message aria-invalid
// pairs with). Glossary articles never emit form-validation ARIA on static
// prose — the site's own form components handle that.
const ariaInvalidStateAttrPattern = /<[^>]*\saria-invalid\s*=/i;
const nonSpaceDelimitedAriaInvalidStateAttrPattern = /<[^>]*[/"'`]aria-invalid\s*=/i;

// aria-description=/aria-details= override or extend the accessible description
// announced for an element with attacker-controlled text — the freeform-text
// twin of the already-blocked aria-describedby (#553) and aria-label (#501).
// aria-description="Verified by Bittensor Foundation" makes a screen reader
// announce a fabricated trust claim for plain prose, and aria-details points AT
// users to attacker-chosen extended content. Same accessibility-name/description
// spoof family as the merged aria-label/aria-describedby/aria-roledescription
// blocks. Glossary articles never set their own ARIA descriptions on static
// prose — the site's components provide accessible names via standard HTML.
const ariaDescriptionAttrPattern = /<[^>]*\saria-(?:description|details)\s*=/i;
const nonSpaceDelimitedAriaDescriptionAttrPattern =
  /<[^>]*[/"'`](?:aria-(?:description|details))\s*=/i;

// aria-braillelabel=/aria-brailleroledescription= are the braille-display
// equivalents of the already-blocked aria-label (#501) and aria-roledescription
// (#561): they override, for braille output specifically, the accessible name
// and role description a refreshable braille display renders. An injected
// aria-braillelabel="Official Bittensor wallet" or
// aria-brailleroledescription="Security Alert" feeds a braille reader a
// fabricated name/role for plain prose — the same accessibility-name/role spoof
// as the merged aria-label/aria-roledescription blocks, just on the braille
// channel. Glossary articles never set their own ARIA braille overrides.
const ariaBrailleAttrPattern = /<[^>]*\saria-braille(?:label|roledescription)\s*=/i;
const nonSpaceDelimitedAriaBrailleAttrPattern =
  /<[^>]*[/"'`](?:aria-braille(?:label|roledescription))\s*=/i;

// aria-placeholder=/aria-multiline=/aria-autocomplete= fake editable text-field
// semantics for assistive technology — the form-widget CONFIG counterpart to the
// already-blocked form-widget STATE attributes aria-disabled/aria-readonly/
// aria-required (#587). aria-placeholder="Paste your seed phrase" announces a
// fabricated input prompt over plain prose, while aria-multiline/aria-autocomplete
// make a static element sound like a fillable field — a no-script accessibility
// spoof that can coax an AT user toward an injected input affordance. Glossary
// articles are read-only prose and never expose editable-field ARIA.
const ariaTextFieldAttrPattern = /<[^>]*\saria-(?:placeholder|multiline|autocomplete)\s*=/i;
const nonSpaceDelimitedAriaTextFieldAttrPattern =
  /<[^>]*[/"'`](?:aria-(?:placeholder|multiline|autocomplete))\s*=/i;

// aria-activedescendant= fakes the virtually-focused child of a composite widget
// for assistive technology: on a container it names the descendant a screen
// reader should treat as focused, so an injected
// aria-activedescendant="evil-link" steers an AT user's perceived focus to an
// attacker-chosen element of static prose without any real focus move or script.
// Same composite-widget spoof family as the merged aria-orientation/
// multiselectable, the grid-position block, and the toggle/selection state block
// (#583). Glossary articles never manage their own ARIA focus on static prose.
const ariaActiveDescendantAttrPattern = /<[^>]*\saria-activedescendant\s*=/i;
const nonSpaceDelimitedAriaActiveDescendantAttrPattern =
  /<[^>]*[/"'`]aria-activedescendant\s*=/i;

// aria-relevant= is the remaining live-region control attribute alongside the
// already-blocked aria-live and aria-atomic (#558): it tells assistive technology
// which kinds of mutation (additions/removals/text) inside a live region to
// announce. It belongs with aria-live/aria-atomic — an injected
// aria-relevant="all" paired with the (separately-blocked) live-region markup is
// the third knob that shapes an interrupting fake announcement, and a static
// glossary that has no live regions never needs it. Same accessibility live-region
// family as the merged aria-live/aria-atomic block; complete the set.
const ariaRelevantAttrPattern = /<[^>]*\saria-relevant\s*=/i;
const nonSpaceDelimitedAriaRelevantAttrPattern = /<[^>]*[/"'`]aria-relevant\s*=/i;

// nowrap on allowed <td>/<th> disables text wrapping in the cell — an injected
// long URL, fake wallet address, or padded phishing line breaks out of the
// column, reflowing the real article text off-screen (a layout-defacement /
// content-spoof primitive in the same class as the merged #451 / #465 cell
// dimension blocks). Article tables in a glossary never set nowrap themselves —
// the stylesheet handles wrapping via .mw-subnets / infobox classes. Tag-scoped
// to td|th with the [\s>/=] boolean lookahead the merged autofocus/hidden rules
// use. parse5 also treats `<td/nowrap>`, `<td /nowrap>`, and
// `<td class="x"/nowrap>` as a real bare nowrap attribute, so those
// slash-boundary forms must be blocked too. Do NOT widen this to every
// `/nowrap` substring: `<td class=x/nowrap>` remains a class value.
const tdThNowrapAttrPattern = /<\s*(?:td|th)\b[^>]*\snowrap(?=[\s>/=])/i;
const quoteAbuttedTdThNowrapAttrPattern = /<\s*(?:td|th)\b[^>]*["'`]nowrap(?=[\s>/=])/i;
const tagNameSlashDelimitedTdThNowrapAttrPattern = /<\s*(?:td|th)\/nowrap(?=[\s>/=])/i;
const whitespaceSlashDelimitedTdThNowrapAttrPattern = /<\s*(?:td|th)\b[^>]*\s\/nowrap(?=[\s>/=])/i;
const quoteSlashDelimitedTdThNowrapAttrPattern = /<\s*(?:td|th)\b[^>]*["'`]\/nowrap(?=[\s>/=])/i;

// colspan=/rowspan= on allowed <td>/<th> merge or split table cells without the
// blocked inline style= attribute — e.g. colspan="99" makes one injected cell
// span the full table width, a content-layout spoof with no script, handler, or
// flagged scheme. Same class as merged #465 (table dimensions) and #479 (nowrap).
const tdThSpanAttrPattern = /<\s*(?:td|th)\b[^>]*\s(?:colspan|rowspan)\s*=/i;
const nonSpaceDelimitedTdThSpanAttrPattern = /<\s*(?:td|th)\b[^>]*[/"'`](?:colspan|rowspan)\s*=/i;

// headers= on <td>/<th> remaps a data/header cell to attacker-chosen ids, while
// scope=/abbr= on <th> change which cells a header announces for and what short
// label assistive tech exposes. That lets article-body tables present different
// semantics to screen readers than to sighted readers, the same table
// accessibility-spoof class as the merged summary= block (#471).
const tdThHeadersAttrPattern = /<\s*(?:td|th)\b[^>]*\sheaders\s*=/i;
const nonSpaceDelimitedTdThHeadersAttrPattern = /<\s*(?:td|th)\b[^>]*[/"'`]headers\s*=/i;
const thScopeAbbrAttrPattern = /<\s*th\b[^>]*\s(?:scope|abbr)\s*=/i;
const nonSpaceDelimitedThScopeAbbrAttrPattern = /<\s*th\b[^>]*[/"'`](?:scope|abbr)\s*=/i;

// aria-sort= on <th> announces a fake ascending/descending order to screen
// readers, while aria-rowcount=/aria-colcount= on <table> and
// aria-rowindex=/aria-colindex= on table rows/cells announce fake table size
// and cell position metadata. That lets article-body tables present different
// ranking/order semantics to assistive tech than to sighted readers, the same
// AT-only table-spoof family as the merged headers=/scope=/abbr= block.
const thAriaSortAttrPattern = /<\s*th\b[^>]*\saria-sort\s*=/i;
const nonSpaceDelimitedThAriaSortAttrPattern = /<\s*th\b[^>]*[/"'`]aria-sort\s*=/i;
const tableAriaCountAttrPattern = /<\s*table\b[^>]*\saria-(?:rowcount|colcount)\s*=/i;
const nonSpaceDelimitedTableAriaCountAttrPattern = /<\s*table\b[^>]*[/"'`]aria-(?:rowcount|colcount)\s*=/i;
const trTdThAriaIndexAttrPattern = /<\s*(?:tr|td|th)\b[^>]*\saria-(?:rowindex|colindex)\s*=/i;
const nonSpaceDelimitedTrTdThAriaIndexAttrPattern = /<\s*(?:tr|td|th)\b[^>]*[/"'`]aria-(?:rowindex|colindex)\s*=/i;

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

// start= on allowed <ol> and value= on allowed <li> renumber ordered-list
// items — an injected <ol start="99"> <li value="1">Step 1: …</li> </ol> makes
// a fake step-99 appear before legitimate step-1, mimicking a long-established
// multi-step procedure (e.g. a fake "Step 99: withdraw your TAO to this
// address" on a wallet tutorial). The wiki's 308+ articles use ordered lists
// heavily (Step 1, Step 2, …); a malicious list start value rewrites the
// reader's mental model of which step they're on. Same content-spoof class as
// the merged frame/rules/summary table block (#471). value= is the per-item
// counterpart (overrides the parent <ol>'s counter); paired so a partial
// attribute set still has no effect. Tag-scoped to ol|li and scanned on
// emptyQuotedAttributeValues() so benign prose and class values pass.
const olStartAttrPattern = /<\s*ol\b[^>]*\sstart\s*=/i;
const nonSpaceDelimitedOlStartAttrPattern = /<\s*ol\b[^>]*[/"'`]start\s*=/i;
const liValueAttrPattern = /<\s*li\b[^>]*\svalue\s*=/i;
const nonSpaceDelimitedLiValueAttrPattern = /<\s*li\b[^>]*[/"'`]value\s*=/i;

// type= on allowed list elements changes marker semantics without CSS: an injected
// <ol type="A"> or <li type="I"> can make procedural steps look like a different
// sequence, while <ul type="square"> restyles bullets as a callout-like block.
// Same list-spoof family as the merged start=/value= block (#483).
const listTypeAttrPattern = /<\s*(?:ol|ul|li)\b[^>]*\stype\s*=/i;
const nonSpaceDelimitedListTypeAttrPattern = /<\s*(?:ol|ul|li)\b[^>]*[/"'`]type\s*=/i;

// reversed on allowed <ol> flips the marker sequence without CSS: a list authored
// as Step 1, Step 2, Step 3 can render as 3, 2, 1, changing procedural meaning in
// wallet/security walkthroughs. Same ordered-list spoof family as start=/value=.
// parse5 also treats `<ol/reversed>`, `<ol /reversed>`, and
// `<ol class="x"/reversed>` as a real bare reversed attribute, so those
// slash-boundary forms must be blocked too. Do NOT widen this to every
// `/reversed` substring: `<ol class=x/reversed>` remains a class value.
const olReversedAttrPattern = /<\s*ol\b[^>]*\sreversed(?=[\s>/=])/i;
const quoteAbuttedOlReversedAttrPattern = /<\s*ol\b[^>]*["'`]reversed(?=[\s>/=])/i;
const tagNameSlashDelimitedOlReversedAttrPattern = /<\s*ol\/reversed(?=[\s>/=])/i;
const whitespaceSlashDelimitedOlReversedAttrPattern = /<\s*ol\b[^>]*\s\/reversed(?=[\s>/=])/i;
const quoteSlashDelimitedOlReversedAttrPattern = /<\s*ol\b[^>]*["'`]\/reversed(?=[\s>/=])/i;

// fetchpriority= on an allowed <img> bumps subresource fetch priority for attacker-chosen
// URLs ahead of legitimate page assets (same img-scoped family as loading #462).
const imgFetchpriorityAttrPattern = /<\s*img\b[^>]*\sfetchpriority\s*=/i;
const imgFetchpriorityQuoteAbuttedPattern = /<\s*img\b[^>]*["'`]fetchpriority\s*=/i;

// decoding= on an allowed <img> forces synchronous image decoding of an
// attacker-chosen URL (decoding="sync"), blocking the main thread until the
// remote image decodes — a no-script content-stall / reading-experience DoS, the
// same img-scoped rendering-control family as the merged loading= (#462) and
// fetchpriority= blocks. Markdown never emits decoding= in source, so article
// content never needs it.
const imgDecodingAttrPattern = /<\s*img\b[^>]*\sdecoding\s*=/i;
const imgDecodingQuoteAbuttedPattern = /<\s*img\b[^>]*["'`]decoding\s*=/i;

// crossorigin= on an allowed <img> forces a credentialed or anonymous CORS fetch
// of an attacker-chosen URL: <img crossorigin="use-credentials" src="//evil/track">
// sends the reader's cookies cross-origin, turning an injected image into a
// *credentialed* tracking beacon distinct from a plain <img src> (which fetches
// without credentials), and changes the request's CORS/timing exposure — all with
// no script, handler, or flagged scheme. Same img-scoped fetch/privacy family as
// the merged loading= (#462), fetchpriority=, and decoding= blocks. Markdown never
// emits crossorigin= in source, so article content never needs it. Tag-scoped to
// <img> and scanned on emptyQuotedAttributeValues() so a quoted alt/src value
// mentioning "crossorigin" passes. The slash-delimited form covers the parseable
// `<img src="x"/crossorigin=…>` and `<img/crossorigin=…>` bypasses; the `\s*=`
// anchor keeps an unquoted URL like src=/wiki/crossorigin-demo.png (no `=` after)
// from matching.
const imgCrossoriginAttrPattern = /<\s*img\b[^>]*\scrossorigin\s*=/i;
const imgCrossoriginQuoteAbuttedPattern = /<\s*img\b[^>]*["'`]crossorigin\s*=/i;
const imgCrossoriginSlashDelimitedPattern = /<\s*img\b[^>]*\/crossorigin\s*=/i;

// ismap on an allowed <img> is the server-side image-map primitive (the counterpart
// to the already-blocked client-side <map>/<area>/usemap= in #411). When set on an
// <img> nested in an <a href="...">, the browser appends the click coordinates
// (e.g. ?37,128) to the link URL — a click beacon with no script, handler, or
// flagged scheme. Tag-scoped to <img> and scanned on emptyQuotedAttributeValues()
// so alt text containing the literal word "ismap" passes. parse5 also treats
// `<img/ismap>`, `<img /ismap>`, and `<img class="x"/ismap>` as a real bare ismap
// attribute, so those slash-boundary forms must be blocked too. Do NOT widen this
// to every `/ismap` substring: the earlier #449 false positive on unquoted URLs
// like `/wiki/ismap-demo.png` still applies, and `<img class=x/ismap ...>` remains
// a class value rather than an attribute.
const imgIsmapAttrPattern = /<\s*img\b[^>]*\sismap(?=[\s>/=])/i;
const quoteAbuttedImgIsmapAttrPattern = /<\s*img\b[^>]*["'`]ismap(?=[\s>/=])/i;
const tagNameSlashDelimitedImgIsmapAttrPattern = /<\s*img\/ismap(?=[\s>/=])/i;
const whitespaceSlashDelimitedImgIsmapAttrPattern = /<\s*img\b[^>]*\s\/ismap(?=[\s>/=])/i;
const quoteSlashDelimitedImgIsmapAttrPattern = /<\s*img\b[^>]*["'`]\/ismap(?=[\s>/=])/i;

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

// noshade (boolean) and color=/size= (value) on an allowed <hr> set obsolete
// presentational styling on a horizontal rule without the blocked inline
// style= attribute — the same content-styling spoof class as the merged
// bgcolor=/background= (#434, #435) on <body>/<table>/<td> and the
// <font color/size/face> attributes (<font> itself blocked in #433).
//
// The wiki emits <hr> very heavily: 618+ horizontal-rule dividers are
// generated from Markdown `---` source in articles across the corpus
// (e.g. subnet_*, yuma_consensus, weight_vector). An injected
// <hr color="red" size="50"> placed after prose like "WALLET COMPROMISED —
// visit evil.example to recover funds" renders an oversized red horizontal
// rule that visually mimics an admin security banner — the same
// content-styling spoof class as the merged frame/rules/summary table block
// (#471). Glossa­ry articles never style their own <hr>; the stylesheet
// sizes them via .divider / theme variables.
//
// Slash-delimited coverage matches the value (color/size) patterns so the
// title "block noshade, color, size" doesn't have an inconsistent gap
// between boolean and value coverage (Codex flagged this on the prior
// #470 attempt).
// clear= on an allowed <br> is the obsolete HTML4 float-clear attribute: an
// injected <br clear="all"> forces float clearing in the document flow, pushing
// content below any floated elements (like infobox images) — a layout-defacement
// primitive in the same class as the merged align/valign block (#435), with no
// script, handler, or flagged scheme.  The wiki generates <br> from Markdown hard
// breaks but never sets the obsolete clear attribute — the stylesheet handles
// float clearing via CSS.  Tag-scoped to <br> with the same whitespace /
// quote-abutted / slash-delimited detection the merged hr noshade block uses.
const brClearAttrPattern = /<\s*br\b[^>]*\sclear\s*=/i;
const nonSpaceDelimitedBrClearAttrPattern = /<\s*br\b[^>]*[/"'`]clear\s*=/i;

const hrNoshadeAttrPattern = /<\s*hr\b[^>]*\snoshade(?=[\s>/=])/i;
const quoteAbuttedHrNoshadeAttrPattern = /<\s*hr\b[^>]*["'`]noshade(?=[\s>/=])/i;
const slashDelimitedHrNoshadeAttrPattern = /<\s*hr\b[^>]*[/"'`]noshade(?=[\s>/=])/i;
const hrColorSizeAttrPattern = /<\s*hr\b[^>]*\s(?:color|size)\s*=/i;
const nonSpaceDelimitedHrColorSizeAttrPattern = /<\s*hr\b[^>]*[/"'`](?:color|size)\s*=/i;

// target= on an allowed <a> overrides the site's deliberate link-handling policy.
// rehype-external-links.js opens external links in a new tab and ALWAYS pairs that
// with rel="noopener noreferrer" precisely because (its own comment) "adding
// target=_blank without a safe rel would expose window.opener (reverse tabnabbing)
// and leak the referrer." A raw author-set <a target="_blank"> re-introduces exactly
// that opener/referrer leak with no paired rel, while target="_top"/target="_parent"
// or a named-frame target hijacks the navigation context. Same "subverts the site's
// deliberate link policy" surface as the merged referrerpolicy=/ping=/download=
// blocks; Markdown never emits target= in source (the build adds it after
// sanitization), so article content never needs it. Tag-scoped to <a> and scanned on
// emptyQuotedAttributeValues() so a quoted href query string like ?target=summer passes.
const anchorTargetAttrPattern = /<\s*a\b[^>]*\starget\s*=/i;
const nonSpaceDelimitedAnchorTargetAttrPattern = /<\s*a\b[^>]*[/"'`]target\s*=/i;

// attributionsrc on allowed <a> or <img> opt an element into the browser's
// Attribution Reporting API. A click or view on attacker-authored markup can
// trigger extra network requests to attacker-chosen reporting endpoints even
// without script, which is the same privacy / tracking-beacon class as the
// merged ping=/referrerpolicy= blocks. Markdown articles never need to control
// attribution sources, so block both the value and boolean forms on the two
// elements that support it. Scan emptied quoted values so benign href/src query
// strings containing `attributionsrc=` are not false positives. parse5 also
// treats `<a/attributionsrc>`, `<a /attributionsrc>`, `<a class="x"/attributionsrc>`
// and the equivalent `<img ...>` forms as real bare attributionsrc attributes,
// so those slash-boundary variants must be blocked too. Do NOT widen this to
// every `/attributionsrc` substring: `<a class=x/attributionsrc ...>` remains a
// class value.
const attributionSrcAttrPattern = /<\s*(?:a|img)\b[^>]*\sattributionsrc\s*=/i;
const nonSpaceDelimitedAttributionSrcAttrPattern = /<\s*(?:a|img)\b[^>]*[/"'`]attributionsrc\s*=/i;
const bareAttributionSrcAttrPattern = /<\s*(?:a|img)\b[^>]*\sattributionsrc(?=[\s>/=])/i;
const quoteAbuttedBareAttributionSrcAttrPattern = /<\s*(?:a|img)\b[^>]*["'`]attributionsrc(?=[\s>/=])/i;
const tagNameSlashDelimitedBareAttributionSrcAttrPattern = /<\s*(?:a|img)\/attributionsrc(?=[\s>/=])/i;
const whitespaceSlashDelimitedBareAttributionSrcAttrPattern = /<\s*(?:a|img)\b[^>]*\s\/attributionsrc(?=[\s>/=])/i;
const quoteSlashDelimitedBareAttributionSrcAttrPattern = /<\s*(?:a|img)\b[^>]*["'`]\/attributionsrc(?=[\s>/=])/i;

// id=/name= on any allowed element are DOM-clobbering primitives: a browser
// exposes id'd and named elements as properties on `document` and `window`
// (named access) and on sibling form/collection objects, so an injected
// `<a id="cookie">` / `<img name="body">` / `<div id="config">` shadows the
// matching `document.cookie` / `document.body` / `window.config` global and can
// break or hijack the site's own scripts — the canonical no-script DOM-clobbering
// / sanitizer-confusion vector. Same DOM-structure-integrity class the merged
// <template> block (its comment cites "named elements ... shadow document.<name>
// globals") and the microdata block already guard. The build emits no id=/name=
// (no rehype-slug, so no heading anchors) and article prose never sets them.
//
// Scanned over emptyQuotedAttributeValues() so a quoted URL query string like
// href="/wiki/x?id=5" passes. The quote-abutted forms cover all three delimiters
// the codebase treats as attribute boundaries (", ', and `) — note backtick is
// NOT stripped by emptyQuotedAttributeValues, so `<a href=`x`id=…>` is a real
// boundary that must be caught. The slash forms are tag-name-scoped or quote-/
// whitespace-anchored (NOT a bare `/id=`) so an UNQUOTED URL such as
// href=/wiki/x?id=5 — where `id=` follows a `?`/path char, not whitespace, a
// quote, or the tag name — is not flagged.
const idNameAttrPattern = /<[^>]*\s(?:id|name)\s*=/i;
const quoteAbuttedIdNameAttrPattern = /<[^>]*["'`](?:id|name)\s*=/i;
const tagNameSlashDelimitedIdNameAttrPattern = /<\s*[a-z][\w:-]*\/(?:id|name)\s*=/i;
const whitespaceSlashDelimitedIdNameAttrPattern = /<[^>]*\s\/(?:id|name)\s*=/i;
const quoteSlashDelimitedIdNameAttrPattern = /<[^>]*["'`]\/(?:id|name)\s*=/i;

// lang=/xml:lang= on any allowed element are the locale sibling of the already-
// blocked dir= attribute (Trojan-Source bidi spoof). lang changes locale-dependent
// rendering and, crucially, the assistive-technology PRONUNCIATION of its text: an
// injected `<span lang="ru">withdraw your TAO here</span>` makes a screen reader
// announce English prose with another language's phonetics/voice, and drives
// `:lang()` CSS — a no-script accessibility / content-spoof surface in the same
// locale/accessibility-spoof class as the blocked dir= and the merged role / aria-*
// family. Article prose is single-language and the build emits no element-level
// lang=, so block it. Scanned over emptyQuotedAttributeValues(); the (?:xml:)?
// group also catches xml:lang=. hreflang= (a different, link-language-hint
// attribute) is NOT matched: the patterns require whitespace, a quote, or the tag
// name immediately before `lang`, and in `hreflang` the `lang` is preceded by
// `href`. An unquoted URL like href=/wiki/x?lang=en (where `lang` follows `?`/path,
// not a boundary char) is likewise not flagged.
const langAttrPattern = /<[^>]*\s(?:xml:)?lang\s*=/i;
const quoteAbuttedLangAttrPattern = /<[^>]*["'`](?:xml:)?lang\s*=/i;
const tagNameSlashDelimitedLangAttrPattern = /<\s*[a-z][\w:-]*\/(?:xml:)?lang\s*=/i;
const whitespaceSlashDelimitedLangAttrPattern = /<[^>]*\s\/(?:xml:)?lang\s*=/i;
const quoteSlashDelimitedLangAttrPattern = /<[^>]*["'`]\/(?:xml:)?lang\s*=/i;

// translate= on any allowed element is the remaining member of the locale/
// translation-control family already blocked as dir= (bidi Trojan-Source) and
// lang=/xml:lang= (AT-pronunciation / :lang() spoof). translate="no" is a current
// living-standard global attribute honored by browser auto-translation (Chrome
// page translation, Google Translate) to exclude a subtree from machine
// translation: an injected `<span translate="no">send 5 TAO to 5Fake…</span>`
// keeps the attacker's literal text untranslated while the surrounding article
// translates, a no-script content-spoof against translation users. Article prose
// is single-language and the build emits no element-level translate=, so block it.
// Scanned over emptyQuotedAttributeValues(); the patterns require whitespace, a
// quote, or the tag name immediately before `translate`, so a `class="translate"`,
// unquoted `class=translate`, `data-translate=`, or a URL containing "translate"
// is NOT flagged.
const translateAttrPattern = /<[^>]*\stranslate\s*=/i;
const quoteAbuttedTranslateAttrPattern = /<[^>]*["'`]translate\s*=/i;
const tagNameSlashDelimitedTranslateAttrPattern = /<\s*[a-z][\w:-]*\/translate\s*=/i;
const whitespaceSlashDelimitedTranslateAttrPattern = /<[^>]*\s\/translate\s*=/i;
const quoteSlashDelimitedTranslateAttrPattern = /<[^>]*["'`]\/translate\s*=/i;

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

  const decodedForAttributes = decodeForSchemeScan(content);
  for (const { pattern, reason } of unsafeContentPatterns) {
    if (!pattern.test(content) && pattern.test(decodedForAttributes)) {
      throw new Error(`Unsafe article content in "${slug}": ${reason}`);
    }
  }

  const emptiedAttributeContent = emptyQuotedAttributeValues(content);

  if (nonSpaceDelimitedHandlerPattern.test(emptiedAttributeContent)) {
    throw new Error(`Unsafe article content in "${slug}": inline event handlers are not allowed in article content`);
  }

  if (nonSpaceDelimitedInteractionSurfaceAttrPattern.test(emptiedAttributeContent)) {
    throw new Error(
      `Unsafe article content in "${slug}": contenteditable, tabindex, draggable, download, popover, usemap, accesskey, referrerpolicy, dir, and ping attributes are not allowed in article content`,
    );
  }

  if (
    contenteditableAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedContenteditableAttrPattern.test(emptiedAttributeContent)
    || tagNameSlashDelimitedContenteditableAttrPattern.test(emptiedAttributeContent)
    || whitespaceSlashDelimitedContenteditableAttrPattern.test(emptiedAttributeContent)
    || quoteSlashDelimitedContenteditableAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": bare contenteditable attributes are not allowed in article content`,
    );
  }

  if (nonSpaceDelimitedPresentationalLayoutAttrPattern.test(emptiedAttributeContent)) {
    throw new Error(
      `Unsafe article content in "${slug}": style, align, valign, bgcolor, background, border, cellpadding, cellspacing, hspace, and vspace attributes are not allowed in article content`,
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
    brClearAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedBrClearAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": clear attributes are not allowed on br elements`,
    );
  }

  if (
    hrNoshadeAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedHrNoshadeAttrPattern.test(emptiedAttributeContent)
    || slashDelimitedHrNoshadeAttrPattern.test(emptiedAttributeContent)
    || hrColorSizeAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedHrColorSizeAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": noshade, color, and size attributes are not allowed on hr elements`,
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
    colDimensionAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedColDimensionAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": width and span attributes are not allowed on col or colgroup elements`,
    );
  }

  if (
    autofocusAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedAutofocusAttrPattern.test(emptiedAttributeContent)
    || tagNameSlashDelimitedAutofocusAttrPattern.test(emptiedAttributeContent)
    || whitespaceSlashDelimitedAutofocusAttrPattern.test(emptiedAttributeContent)
    || quoteSlashDelimitedAutofocusAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": autofocus attributes are not allowed in article content`);
  }

  if (
    hiddenAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedHiddenAttrPattern.test(emptiedAttributeContent)
    || tagNameSlashDelimitedHiddenAttrPattern.test(emptiedAttributeContent)
    || whitespaceSlashDelimitedHiddenAttrPattern.test(emptiedAttributeContent)
    || quoteSlashDelimitedHiddenAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": hidden attributes are not allowed in article content`);
  }

  if (
    downloadAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedDownloadAttrPattern.test(emptiedAttributeContent)
    || tagNameSlashDelimitedDownloadAttrPattern.test(emptiedAttributeContent)
    || whitespaceSlashDelimitedDownloadAttrPattern.test(emptiedAttributeContent)
    || quoteSlashDelimitedDownloadAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": download attributes are not allowed in article content`);
  }

  if (
    popoverAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedPopoverAttrPattern.test(emptiedAttributeContent)
    || tagNameSlashDelimitedPopoverAttrPattern.test(emptiedAttributeContent)
    || whitespaceSlashDelimitedPopoverAttrPattern.test(emptiedAttributeContent)
    || quoteSlashDelimitedPopoverAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": popover attributes are not allowed in article content`);
  }

  if (
    inertAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedInertAttrPattern.test(emptiedAttributeContent)
    || tagNameSlashDelimitedInertAttrPattern.test(emptiedAttributeContent)
    || whitespaceSlashDelimitedInertAttrPattern.test(emptiedAttributeContent)
    || quoteSlashDelimitedInertAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": inert attributes are not allowed in article content`);
  }

  if (
    ariaNameAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaNameAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-label and aria-labelledby attributes are not allowed in article content`,
    );
  }

  if (
    titleAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedTitleAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": title attributes are not allowed in article content`);
  }

  if (
    ariaDescribedbyAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaDescribedbyAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-describedby attributes are not allowed in article content`,
    );
  }

  if (
    roleAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedRoleAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": role attributes are not allowed in article content`);
  }

  if (
    ariaHiddenAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaHiddenAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": aria-hidden attributes are not allowed in article content`);
  }

  if (
    ariaLiveRegionAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaLiveRegionAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-live and aria-atomic attributes are not allowed in article content`,
    );
  }

  if (
    ariaDisclosureAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaDisclosureAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-controls and aria-expanded attributes are not allowed in article content`,
    );
  }

  if (
    ariaRoledescriptionAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaRoledescriptionAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-roledescription attributes are not allowed in article content`,
    );
  }

  if (
    ariaFlowtoAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaFlowtoAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-flowto attributes are not allowed in article content`,
    );
  }

  if (
    ariaKeyshortcutsAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaKeyshortcutsAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-keyshortcuts attributes are not allowed in article content`,
    );
  }

  if (
    ariaCurrentAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaCurrentAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-current attributes are not allowed in article content`,
    );
  }

  if (
    ariaErrormessageAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaErrormessageAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-errormessage attributes are not allowed in article content`,
    );
  }

  if (
    ariaOwnsAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaOwnsAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-owns attributes are not allowed in article content`,
    );
  }

  if (
    microdataAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedMicrodataAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedItemscopePattern.test(emptiedAttributeContent)
    || tagNameSlashDelimitedItemscopePattern.test(emptiedAttributeContent)
    || whitespaceSlashDelimitedItemscopePattern.test(emptiedAttributeContent)
    || quoteSlashDelimitedItemscopePattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": itemscope, itemtype, itemprop, itemref, and itemid microdata attributes are not allowed in article content`,
    );
  }

  if (
    ariaBusyAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaBusyAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-busy attributes are not allowed in article content`,
    );
  }

  if (
    ariaValueStateAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaValueStateAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-valuenow, aria-valuemin, aria-valuemax, and aria-valuetext attributes are not allowed in article content`,
    );
  }

  if (
    ariaStructureAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaStructureAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-level, aria-posinset, and aria-setsize attributes are not allowed in article content`,
    );
  }

  if (
    ariaGridAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaGridAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-colindex, aria-colcount, aria-colspan, aria-rowindex, aria-rowcount, and aria-rowspan attributes are not allowed in article content`,
    );
  }

  if (
    ariaWidgetAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaWidgetAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-orientation and aria-multiselectable attributes are not allowed in article content`,
    );
  }

  if (
    ariaToggleStateAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaToggleStateAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-pressed, aria-checked, and aria-selected attributes are not allowed in article content`,
    );
  }

  if (
    ariaFormStateAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaFormStateAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-disabled, aria-readonly, and aria-required attributes are not allowed in article content`,
    );
  }

  if (
    ariaPopupStateAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaPopupStateAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-haspopup and aria-modal attributes are not allowed in article content`,
    );
  }

  if (
    ariaInvalidStateAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaInvalidStateAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-invalid attributes are not allowed in article content`,
    );
  }

  if (
    ariaDescriptionAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaDescriptionAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-description and aria-details attributes are not allowed in article content`,
    );
  }

  if (
    ariaBrailleAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaBrailleAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-braillelabel and aria-brailleroledescription attributes are not allowed in article content`,
    );
  }

  if (
    ariaTextFieldAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaTextFieldAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-placeholder, aria-multiline, and aria-autocomplete attributes are not allowed in article content`,
    );
  }

  if (
    ariaActiveDescendantAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaActiveDescendantAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-activedescendant attributes are not allowed in article content`,
    );
  }

  if (
    ariaRelevantAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAriaRelevantAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-relevant attributes are not allowed in article content`,
    );
  }

  if (
    tdThNowrapAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedTdThNowrapAttrPattern.test(emptiedAttributeContent)
    || tagNameSlashDelimitedTdThNowrapAttrPattern.test(emptiedAttributeContent)
    || whitespaceSlashDelimitedTdThNowrapAttrPattern.test(emptiedAttributeContent)
    || quoteSlashDelimitedTdThNowrapAttrPattern.test(emptiedAttributeContent)
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
    tdThHeadersAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedTdThHeadersAttrPattern.test(emptiedAttributeContent)
    || thScopeAbbrAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedThScopeAbbrAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": headers, scope, and abbr attributes are not allowed on table cells`,
    );
  }

  if (
    thAriaSortAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedThAriaSortAttrPattern.test(emptiedAttributeContent)
    || tableAriaCountAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedTableAriaCountAttrPattern.test(emptiedAttributeContent)
    || trTdThAriaIndexAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedTrTdThAriaIndexAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": aria-sort, aria-rowcount, aria-colcount, aria-rowindex, and aria-colindex attributes are not allowed on table elements`,
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
    olStartAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedOlStartAttrPattern.test(emptiedAttributeContent)
    || liValueAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedLiValueAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": start and value attributes are not allowed on ol and li elements`,
    );
  }

  if (
    listTypeAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedListTypeAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": type attributes are not allowed on list elements`,
    );
  }

  if (
    olReversedAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedOlReversedAttrPattern.test(emptiedAttributeContent)
    || tagNameSlashDelimitedOlReversedAttrPattern.test(emptiedAttributeContent)
    || whitespaceSlashDelimitedOlReversedAttrPattern.test(emptiedAttributeContent)
    || quoteSlashDelimitedOlReversedAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": reversed attributes are not allowed on ol elements`);
  }

  if (
    imgDecodingAttrPattern.test(emptiedAttributeContent)
    || imgDecodingQuoteAbuttedPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": decoding attributes are not allowed in article content`,
    );
  }

  if (
    imgCrossoriginAttrPattern.test(emptiedAttributeContent)
    || imgCrossoriginQuoteAbuttedPattern.test(emptiedAttributeContent)
    || imgCrossoriginSlashDelimitedPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": crossorigin attributes are not allowed in article content`,
    );
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
    || tagNameSlashDelimitedImgIsmapAttrPattern.test(emptiedAttributeContent)
    || whitespaceSlashDelimitedImgIsmapAttrPattern.test(emptiedAttributeContent)
    || quoteSlashDelimitedImgIsmapAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": ismap attributes are not allowed in article content`);
  }

  if (
    anchorTargetAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAnchorTargetAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(`Unsafe article content in "${slug}": target attributes are not allowed on anchor elements`);
  }

  if (
    attributionSrcAttrPattern.test(emptiedAttributeContent)
    || nonSpaceDelimitedAttributionSrcAttrPattern.test(emptiedAttributeContent)
    || bareAttributionSrcAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedBareAttributionSrcAttrPattern.test(emptiedAttributeContent)
    || tagNameSlashDelimitedBareAttributionSrcAttrPattern.test(emptiedAttributeContent)
    || whitespaceSlashDelimitedBareAttributionSrcAttrPattern.test(emptiedAttributeContent)
    || quoteSlashDelimitedBareAttributionSrcAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": attributionsrc attributes are not allowed on anchor or img elements`,
    );
  }

  if (
    idNameAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedIdNameAttrPattern.test(emptiedAttributeContent)
    || tagNameSlashDelimitedIdNameAttrPattern.test(emptiedAttributeContent)
    || whitespaceSlashDelimitedIdNameAttrPattern.test(emptiedAttributeContent)
    || quoteSlashDelimitedIdNameAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": id and name attributes are not allowed in article content`,
    );
  }

  if (
    langAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedLangAttrPattern.test(emptiedAttributeContent)
    || tagNameSlashDelimitedLangAttrPattern.test(emptiedAttributeContent)
    || whitespaceSlashDelimitedLangAttrPattern.test(emptiedAttributeContent)
    || quoteSlashDelimitedLangAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": lang attributes are not allowed in article content`,
    );
  }

  if (
    translateAttrPattern.test(emptiedAttributeContent)
    || quoteAbuttedTranslateAttrPattern.test(emptiedAttributeContent)
    || tagNameSlashDelimitedTranslateAttrPattern.test(emptiedAttributeContent)
    || whitespaceSlashDelimitedTranslateAttrPattern.test(emptiedAttributeContent)
    || quoteSlashDelimitedTranslateAttrPattern.test(emptiedAttributeContent)
  ) {
    throw new Error(
      `Unsafe article content in "${slug}": translate attributes are not allowed in article content`,
    );
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
