# Product, Category, and Navigation Workflows

Use this when the user asks for product publishing, product edits, product images, batch import, category structure, navigation menus, icons, product landing paths, or catalog cleanup.

For quantity discounts, add-on products, threshold gifts or business-language requests, consult [Capability Map](capability-map.md) and [Marketing Campaigns](marketing-campaigns.md). Before product updates, read the full product and preserve existing variants, quantity_discounts and videos using accepted write shapes (videos are URL strings); these arrays are rebuilt and omission can clear them. Quantity discounts currently require variant_mode=different_price and apply per cart line, not pooled across variants.

## Available Tool Families

- Products: `slimweb_products_list`, `slimweb_products_get`, `slimweb_products_upsert`, `slimweb_products_delete`.
- Product import: `slimweb_products_import_inspect`, `slimweb_products_import_validate`, `slimweb_products_import_commit`.
- Categories: `slimweb_categories_list`, `slimweb_categories_upsert`, `slimweb_categories_delete`.
- Navigation: `slimweb_nav_items_list`, `slimweb_nav_items_upsert`, `slimweb_nav_items_delete`.
- Media: `slimweb_uploads_create`, `slimweb_uploads_commit`, `slimweb_assets_upload`, `slimweb_images_import_chatgpt_attachment`.
- Preview/page support: page and preview tools.

## Product Publishing Pattern

1. Select the site.
2. Inspect existing categories and products.
3. Decide whether the task is single-product upsert or batch import.
4. Upload images first when new media is needed.
5. Upsert product fields, variants, add-ons, category, status, and images.
6. Re-read the product or product list when available.
7. Summarize product name, status, category, price, variants, and images.

Do not invent image URLs or local paths. Product images should use committed media paths returned by SlimWeb upload tools unless the product tool explicitly accepts another supported source.

## Batch Import Pattern

1. Inspect the file with `slimweb_products_import_inspect`.
2. Validate with `slimweb_products_import_validate`.
3. Resolve category, variant, image, and required-field issues before commit.
4. Commit with `slimweb_products_import_commit`.
5. Report created/updated/skipped counts and unresolved warnings.

Do not commit a noisy import when validation reports ambiguous category mapping, missing required prices, or image references the AI cannot access.

## Category Pattern

1. Read the category tree.
2. Create or update the category at the requested parent. If no parent is specified, use root.
3. Use semantic icon SVG when icon generation is requested.
4. Delete only empty categories or categories allowed by SlimWeb backend validation.

## Navigation Pattern

1. Read current navigation items.
2. Decide the item type: page, category, product, article, external URL, or other supported type.
3. If no parent is specified, add at root.
4. Generate semantic icon SVG when requested.
5. Keep labels concise for mobile navigation.

## Common Compositions

- "Launch this product": product upsert + image upload + category assignment + nav entry if requested + preview URL.
- "Add a sale category": category upsert + product assignment/update + homepage/page promotion if requested.
- "Make navigation clearer": nav list + category/page inspection + nav upsert + mobile menu behavior note.
