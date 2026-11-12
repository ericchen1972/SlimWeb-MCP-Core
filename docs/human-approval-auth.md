# Human approval authentication

Sensitive merchant actions return a review link on the hosted MCP origin at
`/human-approvals/{approval_id}?site_code=...` (and `domain=...` for Standalone).
Merchant pages and ordinary OAuth, browser-session, or Bearer credentials cannot
authorize this portal. AI clients must present the link to the person and wait;
they must never approve automatically or ask for approval credentials.

## Browser flow

1. The person explicitly clicks the Google sign-in button. The server creates a
   fresh nonce challenge, bound to the exact approval ID, site code, and domain.
   Its host-only Secure HttpOnly cookie expires after two minutes. The backend
   verifies the Google audience, nonce, recent issue time, and nonce one-use rule.
2. The backend returns a separate opaque human-only ticket. The portal stores it
   in a signed, host-only Secure HttpOnly approval cookie. Tickets expire within
   ten minutes and cannot be exchanged for ordinary API or merchant authority.
3. A read-only page displays the fixed, escaped request and target preview, site
   identity, and the bound Standalone merchant domain. The person checks the
   operation, targets, amount, content, and schedule before choosing a decision.
4. Approval or rejection requires a subsequent POST from the same hosted origin,
   the separate approval cookie, and its decision CSRF token. GET never decides.
   The backend rechecks identity, roles, expiry, target state, and one-use rules.
5. The original AI client or admin retries the exact original request after
   approval. The portal decision itself does not execute that merchant action.

The portal uses same-origin POST checks, `SameSite=Lax` cookies, no-store responses,
escaped text previews, and a nonce-based Content Security Policy that forbids
framing. Browser/API session credentials are deliberately not read by this flow.

## Standalone boundary

The opaque human ticket remains between the hosted MCP and the central registry.
The customer receives only a separate-purpose, short-lived RSA proof signed by
the existing central trusted key. Its audience and purpose distinguish human
approval from ordinary bridge authorization. Customer verification binds the
approval ID, actor, site, registered instance/domain, action, exact HTTP method,
path, serialized-body hash, expiry, and one-use JTI.

Customer requests use a validated registered origin and a socket pinned to the
validated public DNS answer; redirects are refused. A raw human ticket or central
service secret must never be delivered to the customer origin.

## Recovery and operational checks

If a Standalone proof is issued but its delivery fails, that ticket's decision
attempt may already be used. Choose **Sign in again to review** on the preview or
error page. The explicit `action=signin` link starts a fresh Google challenge
even when an approval cookie exists. Review current status before deciding again:
the previous request may have reached the customer despite a lost response.

Before release, run the Core suite, both consumer suites, and the portal suite
against the installed runtime Core in each immutable consumer image. Verify exact
nonzero test counts. Production acceptance additionally requires a real browser
check of Google sign-in, CSP, HTTPS cookies, escaped previews, and explicit
approve/reject decisions; mocked transport tests do not establish those behaviors.
