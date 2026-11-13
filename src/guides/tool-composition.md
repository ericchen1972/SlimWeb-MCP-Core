# Tool Composition for SlimWeb MCP

Use this reference when a user asks for an outcome that spans multiple SlimWeb MCP tools.

## Composition Principle

SlimWeb MCP tools are execution primitives. High-level user requests should be decomposed into inspect, plan, apply, and report steps.

## General Pattern

1. Inspect: read current site state with available list/get tools.
2. Plan: map the request to supported SlimWeb operations.
3. Clarify: ask only for missing details that would change the data materially.
4. Execute: call write tools in a safe order.
5. Verify: re-read important state when tools are available.
6. Report: summarize created/updated items and unsupported parts.

## Common High-Level Requests

### Theme/page/homepage work

- Read theme/page state first.
- Use style profile tools to preserve high-level visual direction and avoid repeating the same user preference discovery.
- Use upload tools before referencing new media in page/theme content.
- For Theme work, call `slimweb_themes_list`, then `slimweb_theme_shell_get_context`, then `slimweb_themes_update_root_elements`; verify with `slimweb_theme_shell_get_context` and `slimweb_themes_list`, then get `slimweb_preview_get_page_url` after the mutation.
- Treat `navbar`, `floating_actions`, and `footer` as the only fixed Theme fragment keys. Every `navbar` must include exactly three runtime slots: one empty static `div`, `nav`, or `header` with `data-storefront-primary-navigation-slot`, one clickable `data-storefront-member-auth-slot`, and one clickable `data-storefront-cart-slot`. Keep runtime labels, URLs, and trees out of Theme HTML. Theme CSS must cover `data-storefront-primary-navigation-runtime`, `data-storefront-category-menu`, `data-storefront-navbar-categories`, `data-storefront-nav-items`, `data-storefront-nav-trigger`, `data-storefront-nav-panel`, `data-storefront-nav-node`, and `data-storefront-nav-children`, including hidden, mobile-open, expanded, grouped-category, direct-navbar-category, and ordinary recursive navigation states. Only the category presentation selected by Webless renders at a time. Keep member authentication combined, preserve reserved member/cart attribute rules, and leave data, behavior, and accessibility to Webless.
- Keep JavaScript and `enabled_libraries` page-scoped; Theme fragments do not load them.
- Get preview URLs after page/theme mutations.

### Product/category/navigation work

- Treat categories and ordinary navigation items as independent concerns; never mirror one tree into another.
- Category taxonomy: read with `slimweb_categories_list`, write only with `slimweb_categories_upsert`, then verify with `slimweb_categories_list`. “我的商品有洋裝、上衣、針織衫” creates or ensures three categories only. If no parent is specified, create at root.
- Ordinary menu/page/external links: read with `slimweb_nav_items_list`, create any separately requested page or target if needed, write only with `slimweb_nav_items_upsert`, then verify with `slimweb_nav_items_list`. “有一個關於我們的連結” creates or ensures the ordinary navigation item only. If no parent is specified, create at root.
- A category mention is taxonomy by default. Only an explicit featured, menu, or link request authorizes a category-linked ordinary navigation item. When both taxonomy and a menu/link entry are explicit, perform and verify the two operations independently; category creation never implies navigation-item creation.
- Backend category-display settings are outside this Skill reference; when explicitly requested, follow the current MCP tool schema and server contract.
- Generate semantic SVG icons as base64 when creating or updating category/navigation icons.
- Use the neutral gray icon color when the user does not specify a color.

### Page/visual design work

- Inspect existing page/theme/asset state where available.
- Plan desktop, tablet, and mobile behavior.
- Use existing assets before generating or uploading new assets unless the user asks for new visuals.
- Keep external CSS/JS scoped and responsive.

### Campaign work

- Plan campaign mechanics before creating coupons, pages, assets, or navigation entries.
- Confirm discount value, validity period, and scope when missing.
- Apply coupon/discount changes before updating page or navigation copy that advertises the offer.
- Prefer a coherent small set of campaign assets over updating unrelated site areas.

### Payment/logistics work

- Read current provider state first.
- Only use supported providers.
- Treat ECPay, NewebPay, and PayNow as mutually exclusive online card providers. LINE Pay can operate alongside the active provider.
- Follow [Commerce Settings](commerce-settings.md) for provider-specific activation, callback setup, and bank-transfer settings. The merchant confirms a reconciled bank transfer in the SlimWeb order details.
- Mask credentials in responses.

## Reporting Pattern

End with:

- What was created.
- What was updated.
- What was left unchanged.
- What still needs user confirmation.
- Any unsupported request that was not executed.
