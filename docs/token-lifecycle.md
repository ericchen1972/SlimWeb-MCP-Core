# Durable credential lifecycle

Browser login creates an eight-hour `swmcp_session` HttpOnly cookie. The login JSON contains only `session.authenticated`; this credential cannot authenticate MCP API requests. OAuth authorization uses this cookie and single-use consent records.

Google login requires `Content-Type: application/json` (an optional charset is accepted). When an Origin header is present, it must exactly match the configured canonical public origin; foreign and opaque `null` origins are rejected before identity verification. Server clients may omit Origin while still sending JSON. Only explicit local runtime modes may derive the origin from the direct request when no public origin is configured.

Authorization-code exchange creates a 15-minute API access token and a 30-day refresh family. Refresh tokens rotate through the durable store's atomic `take`. Reusing a consumed refresh token revokes its whole family, including access tokens already issued by a concurrent refresh. A concurrent replay can make both requests fail; no surviving credential is usable afterward.

`POST /oauth/revoke` accepts `token`, `client_id`, and optional `token_type_hint`. Registered clients receive a successful response for unknown tokens. Known access or refresh credentials revoke their family. `POST /auth/logout` expires the browser cookie, removes its session record, and writes a durable session revocation marker checked by every linked access or refresh credential.

The durable store must support create-only `put`, `get`, and globally atomic `take`, with SHA-256 lowercase hexadecimal keys. Required kinds and maximum TTLs are `session` (28,800 seconds), `access` (900 seconds), and `refresh`, `family`, `revoked_family`, `refresh_history` (2,592,000 seconds). Refresh history survives consumption so replays can identify their family. Revocation markers use create-only inserts; existing markers make revocation idempotent. Missing or unavailable storage fails closed.

Signed public browser and access credentials contain only a version, type, random record ID and expiry. Identity and `backend_grant` remain in encrypted server-side durable records. Access validation loads that record, validates issuer/audience/resource/scope/client and checks family and session revocation. Browser sessions are checked for authorization and authentication-success pages. Legacy seven-day `typ=session` credentials are rejected by HTTP authentication and users must sign in again.

Verified service assertions use the explicit `verifiedServiceIdentityResolver(request)` adapter option. An adapter must independently verify the assertion and return request-local identity, including its resource context. Standalone uses a request-keyed WeakMap; no HTTP header directly sets trusted identity and no reusable session token is minted from an assertion.
