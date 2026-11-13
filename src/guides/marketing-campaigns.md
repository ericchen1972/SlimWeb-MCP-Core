# Marketing Campaigns and Promotions

Use for any sale, gift, bundle, member offer, free shipping, campaign page, poster, email or LINE promotion. First read the relevant rows and pre-refusal checks in [Capability Map](capability-map.md); do not treat “no tool with the same name” as unsupported.

## Choose the mechanism from the business goal

| Goal | Candidate read → write route | Check before proposing or enabling |
| --- | --- | --- |
| More units at a lower price | slimweb_products_list/get → slimweb_products_upsert.quantity_discounts | variant_mode=different_price; one cart line; highest quantity threshold; whole-line percentage discount, not recurring free units or cross-product mix |
| A temporary product price | slimweb_products_get → slimweb_products_upsert.sale_price / sale_ends_at | Preserve variants and existing arrays; variant prices may govern the actual selling price |
| Buy A, add B at a lower price | slimweb_product_add_ons_list → slimweb_product_add_ons_upsert | Different non-service products; price below B's current standalone price; max_quantity × quantity is separate for each normal parent cart line (including its variant), sums the add-on product variants within that parent only, cannot transfer allowance between parent lines; shared SKU stock is checked across all lines; optional selection, not automatically gifted |
| Spend an amount, receive a gift | slimweb_threshold_gifts_list → slimweb_threshold_gifts_upsert | Same-site service product; merchandise subtotal after quantity, member-tier, coupon and code discounts, excluding shipping; highest qualifying tier only, not cumulative or quantity-triggered |
| Give a fixed-value coupon | slimweb_coupon_templates_list → slimweb_coupon_templates_upsert | manual/all_members/order_threshold/birthday/product_bundle; amount, minimum spend and trigger-specific rules; only manual uses slimweb_members_coupons_issue |
| Product purchase gives a coupon | coupon template product_bundle + slimweb_products_get/upsert.gift_coupon_template_id | Coupon assignment and product update are separate; not a fixed-price product bundle |
| Code entered at checkout | slimweb_discount_codes_list → slimweb_discount_codes_upsert | Code, fraction deducted, platform; no assumed date/scope/usage/first-purchase restrictions absent from schema |
| Ongoing loyalty discount | slimweb_member_tiers_list + slimweb_members_get → slimweb_member_tiers_upsert | Cumulative spend, qualification timing, fraction deducted and checkout stacking; not points or subscriptions |
| Free shipping | Web Admin shipping settings | Domestic/overseas fee and threshold exist; current Merchant MCP has no write fields; guide the merchant to Web Admin |
| Explain or promote the offer | Page/article/media/newsletter/LINE tools below | These publish content; they do not implement the checkout discount |

Quantity discount percent is an integer reduction (20 = 20% off). Code/tier discount_percent is a fractional reduction (0.20 = 20% off). 八八折 is 12% off, not 88% off. Check current schema and read-back values; never reuse units blindly.

## Plan only what is needed

1. Identify goal, audience, qualifying products, trigger, reward, period and whether it is automatic. For an exact authorized change, do not force a broad marketing plan.
2. Read the relevant existing rules/products/members. Choose the native mechanism before composing alternatives.
3. Resolve only material missing details. Ask whether buy/get means equivalent pricing, repeated groups or a distinct gift. Do not silently widen scope or invent dates, first-purchase restrictions, redemption limits or unsupported fields. Birthday coupons follow their own validity rules.
4. For a combination, explain differences and let the merchant accept them. Do not create a new SKU, change variants, convert physical products into service items or repurpose coupons without agreement.
5. Before product upsert, read the full product and preserve existing variants, quantity_discounts and videos in accepted write shapes (videos are URL strings). These arrays are rebuilt; omission is not preservation. Avoid unrelated destructive changes and re-read after writing.
6. Check threshold-minus-one, threshold, threshold-plus-one, repeated groups, mixed products/variants and stacking. Five items at 20% off can match buy-four-get-one at five items, but six items differ. Use calculations/previews without creating real orders.
7. Use the checkout semantics below when planning stacking. Verify the target deployment includes this checkout repair before promising redemption; older SaaS/Standalone deployments may differ. A cart display or successful template write is insufficient evidence of final-order behavior.
8. Apply the authorized rule through its current tool, then read back. Follow any tool-specific human confirmation, provider and publication requirements.
9. Create only requested campaign materials. State separately which checkout rules were saved/enabled, which content was published, and which sends/transactions remain unverified.

## Checkout amounts and issued coupons

For quantity/add-on/tier calculations, mandatory variant/combined-stock checks, replay identity and native quote boundaries, read [Capability Map: checkout stacking and deployment differences](capability-map.md#結帳疊加與部署差異). Add-on lines do not receive their standalone quantity discount; tier discounts apply after normal-line quantity reductions to the combined merchandise including add-ons. Use the highest attained tier even at zero reduction, without inheriting a lower tier. Native storefront, consumer client_order_preview/drafts and LINE cart quotes share current server pricing. They remain read-only and do not introduce a Merchant MCP quote tool. Follow the capability-map identity, draft expiry, checkout readiness and handoff limits; do not promise provider acceptance.

In the repaired checkout, the server re-reads current site/member data when creating the order; cart selections are identifiers, not trusted discount amounts. The order is: quantity discount → member-tier reduction → fixed-value issued coupon → proportional discount code on the remaining merchandise amount. The coupon minimum is checked after quantity/member-tier discounts, before coupon/code discounts, excluding shipping. Coupon deductions are capped at that subtotal; code deductions are rounded to whole currency units and capped at the remainder, so merchandise totals cannot become negative. Codes are trimmed and matched case-insensitively within the current site; do not invent date, scope or usage constraints absent from the schema.

A coupon must belong to the current site and signed-in member, have status issued, be within its issued starts_at/expires_at dates, and have no used_at, used_order_id or revoked_at. The current template must exist and have a positive fixed discount. Issued coupon validity governs redemption; changing a template does not replace an issued coupon expiry. The server rejects invalid or below-minimum selections instead of silently accepting the cart display. Coupon consumption and used_order_id are saved in the order transaction; an order failure rolls both back. Replaying the same submission returns the same order, and payment retry reuses that order rather than redeeming again.

Gift eligibility uses merchandise remaining after all four discounts, excluding shipping. Only the highest qualifying tier supplies one same-site service-product gift. Shipping/free-shipping calculation remains based on merchandise after quantity discounts, before member-tier/coupon/code discounts. Zero-total orders are recorded as fully discounted and paid without an external payment request; positive totals retain each provider/channel minimum restriction.

These semantics describe the repaired implementation, not proof that any production site has been updated or that a provider accepted payment. Check the target deployment/version and authorized checkout validation separately; do not create real transactions merely to validate a proposal.

## Campaign materials and communications

- Pages: slimweb_pages_list/get_content/check_title/create/update, then slimweb_content_seo_update in that workflow and slimweb_preview_get_page_url. Homepage is index; do not use removed home-content/upsert tools.
- Articles: slimweb_articles_list/get_content/check_title/create/update, mandatory 16:9 cover, then workflow content SEO.
- Theme: use Theme workflow for site-wide navbar/footer/root styling, not page body changes.
- Media: signed upload create → raw PUT → commit; reuse actual returned paths/URLs. slimweb_posters_create needs configured site AI and must not invent promotion terms.
- Newsletters: slimweb_newsletters_create/list/get/update/delete; always all active members at delivery time, not a selected marketing segment. Schedule creation is not proof of sending; check SMTP/deployment readiness.
- Operational email: slimweb_member_email_preview/send is non-marketing and requires approved preview. Do not use it to bypass newsletter targeting limits.
- LINE: read Bot/readiness and audience; use slimweb_line_push_prepare, show exact audience, message and every URL, obtain final human confirmation, then send/status. A tool/API acceptance does not prove delivery; unknown sends retain the original operation.
- Navigation/category highlights only when requested. Creating a sale category or banner does not create an actual discount.

## Example answers to merchant intent

- 買四送一：先評估數量優惠，說明五件八折的價格方案、規格模式、單行門檻與六件等邊界；確認是否需要每五件送一或另外贈品。
- 買水餃加購醬料：先讀商品與加購關聯，確認 A/B、加購價、max_quantity、庫存；不改成滿額禮。
- 滿千送禮：先查滿額贈禮，確認折扣後金額、服務商品贈品與只取最高一檔；不承諾累贈。
- 生日送百元券：使用 birthday 模板，不要求一般活動日期，也不呼叫 manual issue。
- 老客永久九折：評估累積消費會員等級；不要自行創造付費會員、點數或週期扣款。
- 只對特定分類發一次券：先查現行 schema 是否有分類與次數條件；若沒有，說明精確缺口及可接受方案，不假裝一般券符合限制。

A fully discounted merchandise amount does not waive shipping fees or channel limits. Even a zero grand total must first pass native payment/logistics amount validation (including minimums and maximums). Only an otherwise valid zero-total order uses fully_discounted and skips external payment; Black Cat, frozen CVS and relevant PayNow minimums can reject zero before that bypass.
