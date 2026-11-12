# MCP secure runtime configuration

Production is the default when NODE_ENV is unset. Every SaaS and standalone MCP deployment must configure:

- `PUBLIC_BASE_URL`: the gateway's canonical HTTPS origin, such as `https://standalone-mcp.slimweb.tw`. No credentials, path, query, or fragment. OAuth discovery and issuer URLs use this value rather than a request Host header.
- `GOOGLE_CLIENT_ID`: the Google web client ID explicitly authorized for this deployment. There is no SaaS-client fallback for standalone installations. Google GIS authorized JavaScript origins must include this PUBLIC_BASE_URL.
- `MCP_SESSION_SECRET`: the existing deployment's private signing secret. Never publish this value.
- Persistent OAuth state store and the backend registry/authentication configuration required by the deployment adapter.

Cookies are Secure by default. Production refuses `secureCookies: false`. Local HTTP development requires explicit `NODE_ENV=development` or `runtimeMode: 'development'` and an explicit loopback PUBLIC_BASE_URL when one is configured; tests use `NODE_ENV=test`. Unset or misspelled runtime modes never silently enable development behavior.

Standalone MCP remains a multi-domain gateway: its domain-context adapter is mandatory; each request supplies its domain resource context and the registered backend must authorize that domain after Google identity verification. It is not restricted to a single configured merchant domain.

Google credentials are verified locally with Google's published RSA signing keys. ID tokens are never appended to outgoing URLs. Keys are fetched only from the fixed Google HTTPS JWKS endpoint, without redirects, with a 5-second timeout and 64-KiB response cap, cached using bounded Cache-Control lifetime, and fetch retries are throttled. Signature, RS256 algorithm, audience, issuer, expiry, issued-at, subject and verified email are required. An unknown key or unavailable signing key fails closed.

The SaaS backend independently verifies actor-grant Google proof using `App\Services\Mcp\GoogleIdentityProof`. Set `services.mcp.google_client_id` from the explicit `MCP_GOOGLE_CLIENT_ID` deployment setting, or pass an expected audience selected exclusively from trusted server configuration for the applicable MCP deployment. Do not accept a caller-selected audience. The backend fetches only Google's fixed public PEM certificates endpoint; it does not send the ID token there.

Sources: [Google ID token server verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [OpenID Connect validation](https://developers.google.com/identity/openid-connect/openid-connect).
