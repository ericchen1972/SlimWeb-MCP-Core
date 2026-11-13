# Media Upload and Asset Flow

Use this when the user provides images, asks for generated assets, wants to replace product/page/theme/article media, or mentions ChatGPT attachments, local files, URLs, base64, CSS assets, or external media.

## Preferred Upload Flow

Use the signed upload flow when the AI runtime can read the image bytes and make outbound HTTPS PUT requests:

1. Call `slimweb_uploads_create` with the target usage.
2. Upload bytes to the returned `upload_url`.
3. Call `slimweb_uploads_commit`.
4. Use the returned committed `media_path` in product, page, article, theme, or asset tools.

This is the durable production path. Do not pass invented placeholders, local sandbox paths, `/mnt/data` paths, or inaccessible attachment handles into SlimWeb content tools.

## Usage Selection

Use the narrowest correct upload target:

- `product_image` for product galleries and variants.
- `article_image` for article cover/content images.
- `page_asset` for page or homepage visuals.
- `theme_asset` for theme shell/root design assets.
- `brand_asset` for logos, favicons, and brand visuals.
- `reference` for inspiration/reference images that should not become public site assets yet.

## ChatGPT Attachment Compatibility

If the client supports `slimweb_images_import_chatgpt_attachment`, use it only for the supported attachment flow. If the attachment cannot be resolved to real bytes or a downloadable URL, explain the limitation and ask for a directly downloadable image URL or use a runtime that can upload bytes.

## External Assets vs Uploaded Assets

Use uploaded assets for site-owned images and files.

Use external assets only when the user intentionally wants third-party CSS/JS/fonts/widgets/pixels and accepts the performance, privacy, and reliability tradeoffs.

## Verification

After media changes:

- Re-read the changed product/page/article/theme if possible.
- Get a preview URL for page/theme work.
- Report the committed `media_path` or public asset reference when useful.
