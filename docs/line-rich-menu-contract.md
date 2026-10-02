# LINE Bot, AI and Rich Menu contract

All nine `slimweb_line_*` tools require `integration_settings`. Use site discovery and the resolved site selector; the gateway never trusts a payload site code over the authenticated actor. Settings updates are partial. Channel secret and access token are write-only: reads and mutation responses expose presence only. Conversation history is intentionally unavailable.

1. Read Bot and AI settings. Preserve omitted settings and blank credentials. Resolve readiness warnings: enabled Bot, credentials, verified token and webhook, configured site AI.
2. Prepare the final menu image and coordinate rectangles against its pixel dimensions. Width is 800–2500, height is 250–1724 and width/height must be at least 1.45. Menu names are at most 260 characters; image_path at most 1024.
3. Call `slimweb_uploads_create`, transfer image bytes to the returned signed URL, then `slimweb_uploads_commit`. Use the resulting committed site `media_path` as `image_path`; external URLs and another site's media are not supported.
4. Create a menu with a stable `idempotency_key`, name, chat_bar_text, selected, size, image_path and areas. This creates an unpublished menu. Actions are exclusively uri, message, richmenuswitch and clipboard. Raw postback, alias and switch data are not accepted.
5. Inspect with `slimweb_line_rich_menus_get`; review image, hit areas, readiness and warnings.
6. Publish explicitly using `slimweb_line_rich_menus_publish` and a stable operation key. This sets the Bot default and requires complete backend readiness. Reuse the identical key and payload after an unknown outcome; never invent a new key to retry a possibly completed operation.

For two-way tabs, create A with `menu_key: "a"` and a richmenuswitch action targeting `target_menu_key: "b"`; then create B with `menu_key: "b"` targeting `"a"`. Inspect both, then publish A. Keys match `^[a-z0-9_-]{1,32}$` and are unique per Bot. A switch has exactly one of `target_menu_key` or `target_rich_menu_id`. Future keys are allowed while drafting; publish checks the entire target graph, including cycles, on the same Bot. Existing ID targets must already be managed and ready. Aliases and switch data are server-generated.

Endpoints are under `/internal/mcp/v1/sites/{siteCode}/integrations`: GET/PUT `line-bot`; GET/PUT `line-ai`; GET/POST `line-rich-menus`; GET/DELETE `line-rich-menus/{richMenuId}`; POST `line-rich-menus/{richMenuId}/publish`. Create, publish and delete forward the caller's stable idempotency key in the backend transport and body.

Standalone capabilities are independently gated: `line_bot_settings_read/write`, `line_ai_settings_read/write`, `line_rich_menus_read/write`. `full_contract_v1` alone must not advertise them on an older installation.

## Release dependency

Core v0.1.12 introduces this contract. Consumers must pin v0.1.12 or later and regenerate/install lockfiles before deployment. Deploy the backend routes and capability advertisement before enabling the updated gateway. Run Core and both consumer test suites against the installed release, including the frozen 146-tool SaaS contract.
