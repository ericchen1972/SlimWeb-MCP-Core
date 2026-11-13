# SlimWeb MCP Core

Environment-neutral Node.js ESM package for SlimWeb MCP protocol handling, Google OAuth/session behavior, the public tool catalog, tool orchestration, tool-profile projection, and resource-context binding.

Product repositories must inject their own account repository, backend clients, runtime configuration, and deployment adapters. This package contains no database or merchant-storage access.

## Site AI boundary

General MCP tools remain available without a configured site AI provider: the external AI client composes page, article, and newsletter content. `slimweb_newsletters_create` stores supplied HTML and schedules delivery; it does not generate content on the server.

`slimweb_posters_create` delegates generation to the site's backend gateway. The backend must resolve the site's single `provider` (`none` by default, `agnes`, or `openai`), encrypted `api_key`, `text_model`, and `image_model`; no shared platform credential fallback is permitted. Agnes defaults are `agnes-2.5-flash` and `agnes-image-2.5-flash`. Both immediate requests and queued generation must enforce the current site configuration. Core propagates backend configuration errors and never calls an AI provider directly.

There is no public MCP AI-credential settings tool. Configure credentials in the site integration settings; do not send secrets in general tool arguments.

Core changes must be released with a new immutable Git tag, then both `SlimWeb-MCP` and `SlimWeb-Standalone-MCP` must update their `@slimweb/mcp-core` dependency and lockfile to that tag. Run Core and consumer tests against the new package before deploying either shell. Backend gateway changes are deployed separately and must also reach standalone backend installations.

## Development

```bash
npm install
npm test
```

## Website notifications
See [site.notification contract](docs/site-notification-contract.md). One website subscription delivers new-order and return-request notices only. Display in the subscribed chat and wait for user instructions before actions. Requires Work Cloud host support; actual UI acceptance is separate from server tests.

## Merchant capability discovery

`src/merchantCapabilities.js` supplies compact business-intent routing and pre-refusal checks to standard initialize, server/discover and service-information responses, including deployment-specific guideline profiles. `slimweb://guides/merchant-capabilities` is a static Markdown resource containing the complete capability map, merchant terminology, boundaries and tool inventory; it does not enable filtered tools or bypass authentication.

The maintained guide source is SlimWeb-MCP-Skill/references/capability-map.md. Its scripts/sync-capability-guide.mjs copies the guide into this package; run that script with --check and Core tests after updates. The Markdown must ship with src/app.js. Source updates require a Core release and consumer dependency/deployment update before remote clients receive them.


## Current operating guides (thin Plugin)

The local Skill is a stable bootstrap. At each new task, authenticated clients call `slimweb_guides_get` with `topic=index`, then `overview` and the relevant catalog topics before advice or mutations. The result includes the deployed content hash (`guide_version`), per-topic SHA-256, and full Markdown. Detailed guidance lives in the immutable server release, so routine guidance changes need a Core release and MCP consumer deployment, not a local Plugin reinstall. New tool schema discovery may still need a client refresh; this does not update local Plugin binaries automatically.

Canonical authoring sources are `SlimWeb-MCP-Skill/guides/overview.md` and its root `references/*.md`. Export them with that repository's `scripts/export-guides.py --output <new-directory>`, then replace `src/guides/` with the verified output and sync `references/capability-map.md` to `src/merchant-capabilities.md`. The loader validates the manifest and all file bytes at startup. Topic selection only accesses allowlisted manifest names; arbitrary paths and URLs are not accepted. `slimweb://guides/index` and individual topic resources expose the same deployed bundle. Guide content requires an authenticated identity but no selected site or business permission. It never enables excluded tools or grants site/confirmation authority.

Read guides again when the task topic changes; if reads fail, stop the affected mutation and resolve the connection instead of falling back to a stale bundled manual. Clients may use only guides matching the current index version during a task. Existing capability resource clients remain supported by the synced guide; all permission and resource-context checks still apply.
