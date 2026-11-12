# Canonical merchant operation policy

`SlimWeb-MCP-Core/src/operation-policy.v1.json` is the sole authored policy. The exact bytes ship beside `App\Services\Mcp\McpOperationPolicy` in both PHP applications. Do not maintain permission aliases or per-client role tables.

Each operation has `all` (every role required) and `any` (at least one role, or no alternative requirement when empty). `system_admin` satisfies known operations; unknown operations always fail closed. PHP still resolves the current site membership on every request. Existing first-site-administrator owner behavior is preserved. No session role snapshot grants backend access.

Roles are the existing keys assignable by `SiteAdminController::allowedPermissionLabels`. Singular `order_management`/`order_list`, `payment_logistics`, and retired grouping strings grant no access. Category, page, navigation, import, article, membership tiers and promotion operations use their corresponding actual browser roles. Newsletter operations require `newsletter_management`. Product posters require `ai_integration_settings`; customer-service log access uses `customer_service_logs`.

LINE member/push operations require `integration_settings` AND `member_list` in addition to `backend_ai_assistant`. Product-bearing push preparation additionally requires product access through a policy `requiresWhen` condition. Site notification subscriptions require order AND return access. Unsubscription remains available to a current AI-enabled member so revoked notification permissions can be cleaned up.

`actions` maps server-owned PHP controller actions to operations; caller tool/permission headers never select authorization. Shared PHP resolver integration enforces that map before controller work. Legacy MCP controller actions are included. Human approval and rate middleware must call `resolveOperation` before exposing a preview or executing business work. `resolveOperationForAdmin` rechecks browser/admin membership and operation permission.

Core discovery and execution use the same reader. Discovery evaluates requirements separately per site, preventing a union of unrelated memberships from satisfying an AND rule. Subscription preflight checks current site roles; PHP remains the final authority. Repository `permission` transport metadata is derived from the policy and is advisory only.

From the Core repository:

```sh
node scripts/sync-operation-policy.mjs
node scripts/sync-operation-policy.mjs --check
node scripts/check-operation-policy-parity.mjs ../webless
node scripts/check-operation-policy-parity.mjs ../SlimWeb-Standalone
NODE_ENV=test node --test test/operationPolicy.test.js test/events.test.js test/backendRepository.test.js test/toolProfile.test.js
```

The PHP/Core parity check enumerates empty, individual, AI+individual, full and explicit requirement combinations, including conditional product payloads and unknown operations. PHP feature tests check current membership revocation/deletion, first-admin behavior, assignable-role inventory and every registered site MCP route.

Native browser operations use `resolveBrowserOperationForAdmin`, which checks the same current membership and canonical domain rules while excluding only `backend_ai_assistant` from the transport requirements. MCP resolvers retain the AI permission requirement. Approval records retain a server-derived `require_ai` origin flag so later browser approval cannot weaken an MCP-origin request.
