# Security Policy

Taopedia is a public Bittensor knowledge base. Please report suspected vulnerabilities privately instead of opening a public issue.

## Reporting

Email the maintainers or use GitHub private vulnerability reporting if it is enabled for this repository.

Include:

- affected repository and file paths;
- steps to reproduce;
- impact;
- suggested fix, if known.

## Maintainer Rules

- Do not expose deployment URLs, build hook URLs, API tokens, or Netlify secrets in issues, pull requests, or docs.
- Review changes to workflows, build scripts, dependency files, Netlify config, and MDX rendering paths carefully.
- Require `npm run build` before merging app changes.
- Keep article/content changes in `taopedia-articles` unless an app change is required.
- Treat contributor-controlled article data as untrusted input.

## Supported Branch

Security fixes are applied to `main`.
