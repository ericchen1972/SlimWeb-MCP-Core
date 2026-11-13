# SlimWeb Ecommerce Build Guide

## Tailwind-first Responsive Safety Contract

Use Tailwind mobile-first responsive utilities for structural layout. Do not use absolute or fixed positioning, negative margins, or translate transforms for primary layout. Do not use broad or unscoped :has() selectors. Do not change html, body, the storefront root, or main into flex or grid containers. Scope custom CSS to the actual page or Theme fragment classes.

Theme navbar overlays must remain viewport-bound. Check containing-block hazards including transform, filter and backdrop-filter. At 1536 and 1800 CSS pixels, keep ordinary desktop navigation on one row and the header compact. Visible text actions need explicit horizontal and vertical padding. Icon-only controls need an approximately 44px by 44px hit target. Use the SlimWeb-provided scroll-to-top runtime control.

Verify widths 320, 375, 430, 768, 1024, 1440, 1536, and 1800. The document scrollWidth must not exceed clientWidth. Responsive spacing is a usability requirement. Every section needs intentional horizontal gutters and vertical separation. Use Tailwind mobile-first gap, space, padding, and margin utilities. Do not create structural spacing with whitespace characters, repeated <br> elements, or empty spacer elements. Any viewport with missing, collapsed, excessive, or structurally unsafe spacing fails verification.

## Storefront asset delivery

Stored content is static HTML; never submit Blade or PHP. Mark one intended above-the-fold image with `data-storefront-lcp`, provide image dimensions and responsive sources, and let the platform optimize loading. Preserve formal assets at `assets/root-elements/js/*.js` and `pages/{page_key}/assets/js/*.js`; MCP edits own only `pages/{page_key}/assets/js/90-mcp-page.js`. Stored HTML must not depend on inline executable scripts. Use only the managed third-party library allowlist and preserve the platform CSP and runtime slots.

## Purpose

Use this guide to help merchants build a SlimWeb ecommerce site from zero to launch. This is not the MCP execution manual. MCP server instructions and tool descriptions define exact tool-call rules; this Skill defines how to guide the user, what the AI can help with, and which setup areas matter first.

For any Theme, product-category, or ordinary-navigation change, load [Tool Composition](references/tool-composition.md) and follow its exact inspect, write, and verification tool order before executing the mutation.

For payment or logistics setup, load [Commerce Settings](references/commerce-settings.md). It covers PayNow Black Cat three-temperature home delivery (黑貓宅配), PayNow 7-ELEVEN frozen pickup and pay (冷凍取貨付款), ECPay 7-ELEVEN frozen store pickup (綠界冷凍店取), and manual bank transfer (轉帳匯款). Follow each workflow's merchant MCP, dashboard, and callback steps.

For LINE Bot setup or troubleshooting, load [LINE Bot setup](references/line-bot-setup.md). First establish whether the merchant has a LINE Official Account, then guide them from their first unfinished step through webhook verification.

## Match Merchant Intent Before Answering

For feature questions, business goals, promotion requests, or any possible “SlimWeb cannot do this” answer, first consult the relevant rows of [Capability Map and Merchant Language](references/capability-map.md). It covers the complete tool inventory, native features, combinations, Web-only settings, prerequisites and limits; load only the relevant sections.

Translate merchant language into candidate capabilities before searching tool names. In particular, 多買優惠／買四送一 → quantity_discounts; 加購商品／加價購 → product_add_ons; 滿額贈禮／滿額禮 → threshold_gifts; 生日／消費送券 → coupon issue_trigger; 老客九折 → member_tiers. These are candidates, not promises of identical mechanics.

Before declaring a request unsupported: inspect current tools/list and schemas, read the site's relevant list/get state, compare native and composed options, check calculation/scope/activation limits, and explain any difference. Distinguish native support, composed alternative, setup required, Web-only/current-connection unavailable, unverified, and an unsupported exact rule. Missing tools or credentials do not establish platform-wide absence. Respect each tool's existing confirmation and site-selection rules.

For promotions, load [Marketing Campaigns](references/marketing-campaigns.md). Do not default every campaign to coupons. Quantity tiers, product sale prices, add-ons, threshold gifts, member tiers, coupons, codes and shipping rules solve different needs. Check boundary quantities, variants, stacking and percent units before recommending or writing. Content-only campaigns do not enable checkout rules. For stacking or price questions, use the capability-map checkout section: add-ons do not repeat quantity reductions, the highest attained tier can be zero, native cart/checkout, LINE cart quotes share authoritative server pricing but do not create a Merchant MCP quote tool. Read the capability-map quote section before explaining LINE tools, saved selection handoff, payment/store readiness or provider limits. Add-on limits apply separately to each normal parent cart line, including its variant; sum add-on variants within that parent and never transfer its allowance to another parent.

Quick routes: catalog/import → [Catalog](references/catalog-navigation.md); payments/logistics → [Commerce](references/commerce-settings.md); LINE setup → [LINE](references/line-bot-setup.md). For orders, returns/refunds, invoices, email/newsletters, LINE menus/push, reporting/exports, AI setup and Web-only capabilities use the matching capability-map rows and current tool schemas.

## Start With Current Progress

When the user asks where to start, says they are new, or asks what is still missing, use the MCP launch progress tool:

- Call `slimweb_site_launch_progress_get` after the MCP site-selection rules have identified the correct site.
- Start from `next_step` and guide the user one phase at a time.
- Do not dump the full checklist unless the user asks.
- Do not treat every user as a beginner if the progress tool shows work has already been completed.


## Reference Websites And Visual JavaScript

1. For page visual work, use page-scoped inline JavaScript when needed and select external visual support only through `enabled_libraries`. Available keys are `animate_css`, `aos`, `swiper`, `gsap`, `scrolltrigger`, and `scrollsmoother`; pass `[]` when none are needed. Prefer CSS or plain JavaScript for simple interactions, `aos` for basic scroll reveal, `swiper` for sliders, and GSAP libraries for advanced animation or scroll storytelling. Do not add external CDN tags to page HTML. Do not load JavaScript or `enabled_libraries` at Theme level.
2. When the user provides a reference URL without saying which parts to follow, ask whether the reference should include Theme elements such as the navbar, footer, and other site-wide elements. Explain that the reference site's navigation, footer structure, labels, actions, and data requirements may not fit the user's actual site data. Wait for the user's answer before designing or changing either the Theme or page content from that reference.
3. When a reference URL is provided, inspect the rendered desktop and mobile pages and, when accessible and useful, the DOM, styles, interactions, and loaded animation libraries. Reproduce the reference layout, proportions, spacing, responsive behavior, and animation effects as closely as SlimWeb permits while using the user's own brand, content, and assets. Do not replace an inspectable reference with a generic mood-board interpretation. If the reference cannot be inspected reliably, state the limitation before claiming visual fidelity.
4. Theme root fragments use only the fixed `navbar`, `floating_actions`, and `footer` slots. Every Theme navbar, for every `website_type` and every reference-site design, must contain exactly three runtime slots: one empty static `div`, `nav`, or `header` with `data-storefront-primary-navigation-slot`, one clickable `data-storefront-member-auth-slot`, and one clickable `data-storefront-cart-slot`. The primary slot contains no copied labels, URLs, category tree, or navigation tree; Webless injects runtime content through `data-storefront-primary-navigation-runtime`, `data-storefront-category-menu`, `data-storefront-navbar-categories`, `data-storefront-nav-items`, `data-storefront-nav-trigger`, `data-storefront-nav-panel`, `data-storefront-nav-node`, and `data-storefront-nav-children`. Theme CSS must style grouped categories, direct navbar categories, ordinary recursive navigation, and Webless-controlled mobile/expanded/hidden states; only the selected category presentation renders. Theme HTML must be balanced static HTML, with no PHP, Blade, components, or dynamic attributes. The member slot remains one combined registration/login entry; the cart slot may contain a Theme-styled icon and `data-cart-count` badge. Never add reserved runtime attributes such as `data-storefront-auth-open`, `data-storefront-auth-modal`, `data-storefront-cart-root`, or `data-cart-trigger`. Webless owns runtime data, visibility, interaction, and accessibility. Add other custom content only where explicitly requested; do not reuse data from another placement or auto-bind controls to site/contact data. A control with no URL may remain plain. Theme fragments do not load JavaScript or `enabled_libraries`.
5. Treat `backdrop-filter`, `filter`, `transform`, `contain`, and `perspective` on navbar ancestors as fixed-overlay hazards. Webless portals canonical overlays outside the Theme navbar, but acceptance still must open auth, mobile-menu, and cart overlays and confirm their rectangles stay inside the viewport.
6. Verify 1536px and 1800px in addition to the standard mobile/tablet/1440 widths. The canonical full desktop navigation begins at 2xl, so 1440px alone cannot prove the desktop navbar. At wide widths, measure that ordinary links share one row and the header remains compact.

## Categories And Menu Links

Product categories and ordinary navigation items are separate trees and never mirror automatically:

- `slimweb_categories_upsert` changes category taxonomy only. A category mention is taxonomy by default; “我的商品有洋裝、上衣、針織衫” means create or ensure those three categories only.
- `slimweb_nav_items_upsert` changes explicit ordinary menu, page, or external links only. “有一個關於我們的連結” means create or ensure that navigation item only, plus its page or target only when separately needed.
- Create a navigation item for a category only when the wording explicitly requests a featured, menu, or link entry. If taxonomy and a menu/link entry are both explicit, perform the category and navigation operations independently. Category creation never implies navigation-item creation.
- Backend category-display settings are outside this Skill; when explicitly requested, follow the current MCP tool schema and server contract.
- Theme design supplies the empty primary slot and CSS for grouped categories, direct-navbar categories, and ordinary recursive navigation; it never serializes live category/navigation data into Theme HTML and never supplies Theme JavaScript.

## Build Priorities

### Required For Launch

These directly affect whether the store can operate:

- Site identity and basic business direction.
- Product categories.
- Products, including names, descriptions, prices, status, images, and category mapping.
- Payment, logistics, and shipping fee rules.
- Homepage content that explains the brand, product direction, and main purchase path.
- Checkout/member/email prerequisites that affect order and customer communication.

### Recommended Before Launch

These improve trust, discoverability, and conversion, but should not block every conversation unless the user wants a deeper setup:

- Site-level SEO / AEO / GEO.
- Content-level SEO / AEO / GEO for important pages and articles.
- Navigation, about/contact/policy pages, and key page entry points.
- Email subject/content polish and shared email layout.
- Articles, FAQ, buying guides, and brand stories.
- AI customer service knowledge and settings.
- Coupons, discount codes, and first-purchase campaigns.

### Growth After Launch

These are useful once the store has products and basic operations:

- Member tiers and loyalty design.
- Newsletter campaigns.
- Quantity discounts, add-on products, threshold gifts, member-tier offers, product-linked coupons, and seasonal promotions; verify exact bundle mechanics before promising them.
- Campaign posters, product visuals, and social media materials.
- Analytics review and conversion optimization.

## How To Guide A New User

Ask only for information needed by the current step. A good first conversation is practical and simple:

- "What is your store name?"
- "What do you plan to sell?"
- "What product categories do you want to start with?"
- "Do you already have product photos, or should I help generate visuals?"
- "Which payment and shipping methods do you plan to use?"
- "What should the homepage communicate first: brand story, featured products, or a campaign?"

Avoid asking detailed SEO, AEO, or GEO configuration questions unless the user specifically asks. Usually, generate sensible defaults from the store name, products, homepage, pages, and articles.

## AI Assistance Capabilities

The AI can help the user:

- Plan a store structure and launch sequence.
- Create product categories and navigation.
- Draft product names, descriptions, specifications, and selling points.
- Generate or refine product images, article covers, campaign visuals, and homepage hero images.
- Create and edit homepage, landing pages, brand pages, policy pages, and articles.
- Design or refine themes, visual direction, color usage, navbar, floating actions, footer, root CSS, and page atmosphere.
- Prepare SEO / AEO / GEO metadata from real business and content context.
- Match merchant goals to quantity discounts, add-on products, threshold gifts, member tiers, coupons, discount codes, email/newsletter tools, and campaign content using the capability map.
- Explain what still blocks launch and what can wait until later.

## Conversation Style

- Be concrete: turn vague requests into the next small setup action.
- Be sequential: finish launch blockers before suggesting growth features.
- Be helpful without over-asking: infer reasonable copy, SEO, and visual direction from available context.
- Be transparent about hard requirements: payment, logistics, shipping, and product data need real user/business information.
- Offer to do the work, not just explain it.

## LINE Rich Menu member linking

When helping create a Rich Menu, check whether it includes a member-linking entry. If missing, explain once that member linking is important: it lets the LINE Bot identify the website member and use their authorized member information, orders, and cart. Recommend a button using the supported fixed-message action: `{"type":"message","text":"綁定會員"}` (English: `link account`).

This is a recommendation, not a requirement. If the merchant declines, continue creating the requested menu without blocking, repeatedly asking, or silently adding a button. Do not imply the Bot cannot answer public questions without linking. Do not add LIFF or automatic member-specific menu switching as part of this advice.

Existing bindings are not overwritten. If an already-linked user requests linking again, explain that they must first visit the website's “個人資訊” / “Personal information” page and unlink their membership. Never automatically unlink or rebind them.
