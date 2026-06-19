// Build the /llms.txt index (https://llmstxt.org): a plain-Markdown map of the
// wiki for LLMs and agents -- an H1 site title, a one-line summary blockquote,
// and a flat list of every published article as a Markdown link with its
// single-line summary. Pure and exported so the format can be unit-tested
// without rendering the site (the same pattern as robots.js / the feed builders).
const SITE_NAME = 'Taopedia';
const SITE_SUMMARY =
  'A Bittensor-focused knowledge base for TAO, subnets, wallets, staking, mining, validation, and consensus.';

const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function buildLlmsTxt({ siteUrl, articles }) {
  const root = String(siteUrl).replace(/\/$/, '');
  const lines = [`# ${SITE_NAME}`, '', `> ${SITE_SUMMARY}`, '', '## Articles', ''];
  for (const article of articles) {
    const url = `${root}/wiki/${article.slug}/`;
    const summary = oneLine(article.summary);
    lines.push(summary ? `- [${article.title}](${url}): ${summary}` : `- [${article.title}](${url})`);
  }
  return lines.join('\n') + '\n';
}
