# OAuth consent page visual update

Approved direction: light brand card, shared by SaaS and Standalone.

## Presentation

- Pale neutral background and a centered white card, with a restrained teal brand accent and SlimWeb wordmark.
- Clear heading explains connecting the named application to SlimWeb.
- Separate sections show the signed-in account, application name, accessible website names, and the existing read/write permission scope.
- Show each website as a compact chip. Long application names, emails and URLs wrap without horizontal overflow.
- Put the exact registered callback URL in an expandable connection-details section; retain its visibility for inspection.
- A prominent allow button and a secondary deny button have clear focus and hover states. On narrow screens, use full-width stacked controls.
- Preserve Traditional Chinese for Chinese browser language and English otherwise. Use system fonts and inline CSS without external dependencies.

## Boundaries

Only presentation changes. Keep Google login, consent token, form method/action, decision values, PKCE, exact registered callback validation, CSP and tenant boundaries unchanged. Escape all dynamic text. Do not introduce scripts, network assets, new permissions or automatic consent.

## Implementation and validation

Render the page through a focused shared Core helper. Verify desktop and mobile screenshots, English and Traditional Chinese text, keyboard focus, long content wrapping, and the existing allow/deny OAuth tests. Pin the resulting immutable Core commit in both gateways. Build candidates with preserved runtime settings, verify readiness, then promote both services and inspect their actual consent pages. No new test authorization grant is required merely to inspect the page.
