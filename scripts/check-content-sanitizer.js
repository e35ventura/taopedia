import assert from 'node:assert/strict';
import { validateArticleContent } from './sync-articles.js';

const TAB = String.fromCharCode(0x09);
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

function rejects(content, label) {
  assert.throws(() => validateArticleContent('fixture', content), /Unsafe article content/, label);
}

function accepts(content, label) {
  assert.doesNotThrow(() => validateArticleContent('fixture', content), label);
}

// <base> tags are blocked: a single <base> rewrites every relative URL on the page.
rejects('Intro.\n\n<base href="https://evil.example/">', 'plain <base>');
rejects('Intro.\n\n<  base   href="https://evil.example/">', 'spaced <base>');

// Plain dangerous URL schemes remain blocked.
rejects('See [x](javascript:alert(1)).', 'plain javascript:');
rejects('See [x](vbscript:msgbox(1)).', 'plain vbscript:');
rejects('See [x](data:text/html;base64,PHNjcmlwdD4=).', 'plain data:text/html');

// Obfuscated dangerous schemes are now blocked too.
rejects('See [x](java&#115;cript:alert(1)).', 'decimal-entity javascript:');
rejects('See [x](java&#x73;cript:alert(1)).', 'hex-entity javascript:');
rejects('See [x](javascript&colon;alert(1)).', 'named-colon javascript:');
rejects(`See [x](java${TAB}script:alert(1)).`, 'tab-split javascript:');
rejects(`See [x](java${ZERO_WIDTH_SPACE}script:alert(1)).`, 'zero-width javascript:');
rejects('See [x](&#100;ata:text/html,evil).', 'entity data:text/html');
rejects('See [x](vb&#115;cript:msgbox(1)).', 'decimal-entity vbscript:');

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
  'Encode an ampersand as &amp; or a snowman as &#9731; without tripping the scanner.',
  'benign entities'
);
accepts(
  'A query like [docs](https://example.com/online=1) is fine — a URL path segment is not a handler.',
  'url segment resembling a handler (not inside a tag)'
);

console.log('Content sanitizer check passed');
