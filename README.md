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
