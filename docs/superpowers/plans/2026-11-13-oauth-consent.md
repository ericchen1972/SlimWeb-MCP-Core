# OAuth Consent Implementation Plan

> Execute inline using executing-plans, as authorized by the user.

**Goal:** Apply the approved light consent card to both production gateways.

**Architecture:** A shared pure HTML renderer in Core receives escaped dynamic values and localized labels. OAuth retains all protocol and security decisions.

**Tech Stack:** Node.js, HTML, embedded CSS, node:test, Cloud Run.

- [ ] Create `test/oauthConsentPage.test.js` covering localization, escaping, exact form fields and callback disclosure; observe failure before adding `src/oauthConsentPage.js`.
- [ ] Implement the shared renderer with neutral background, teal accent, account/application sections, site chips, scope description, native details, responsive action buttons and visible focus styles. Replace only HTML rendering in `src/oauth.js`.
- [ ] Run `npm test` in Core and both gateway repositories after pinning the new immutable Core commit. Preserve unrelated working changes.
- [ ] Inspect rendered desktop/mobile pages and long-content wrapping. Review source changes independently.
- [ ] Commit and push Core, pin both gateways, stage only Dockerfile/package files/src on mounted BOBO, Cloud Build immutable images, deploy no-traffic candidates with runtime preservation, verify readiness, promote both.
- [ ] Inspect real production SaaS and lujiu consent pages in the browser without submitting a new grant. Save screenshots and deployment evidence to BOBO.
