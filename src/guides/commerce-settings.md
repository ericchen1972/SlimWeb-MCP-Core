# Commerce Settings: Payments and Logistics

Use this when the user asks about SlimWeb payment providers, logistics providers, provider setup, credentials, enablement, or what their SlimWeb site supports.

## Supported Providers

SlimWeb supported payment providers:

- ECPay.
- NewebPay.
- PayNow.
- LINE Pay.
- Manual bank transfer (轉帳匯款).

SlimWeb supported logistics providers:

- ECPay logistics, including 7-ELEVEN B2C frozen store pickup.
- NewebPay logistics.
- PayNow C2C logistics, including 7-ELEVEN frozen pickup and pay for eligible merchants, and Black Cat home delivery at ambient, refrigerated, and frozen temperatures.
- HCT logistics.

Do not invent other providers.

## Answering User Questions

When the user asks "What payment can my SlimWeb site use?", answer only from the SlimWeb supported provider list.

When the user asks "What payment should an ecommerce site use?" and they are using a generic AI client outside a SlimWeb site-setting context, explain that this is general ecommerce advice and not a SlimWeb site setting. If the conversation is inside SlimAI, answer from SlimWeb supported providers first.

## Setup Rules

- AI may fill provider credentials only for supported providers and fields exposed by MCP.
- Use the merchant MCP to enable or disable providers and configure fields exposed by its update schema. For bank transfer, use the `offline` payment entry.
- ECPay, NewebPay, and PayNow are mutually exclusive as the active online card provider. Pass `switch_primary_to` only when the merchant explicitly requests a switch.
- If the update returns `activation_deferred`, report the settings as saved and the provider as pending activation. Read back the current active provider before testing checkout.
- LINE Pay is exempt from the online-card exclusivity rule and may be enabled alongside one online card provider.
- Preserve existing credentials unless the user asks to replace them.
- Never expose full existing secrets in normal responses. Mask credentials when summarizing.

## Clarification Rules

Ask before writing when:

- The provider is not named.
- Required credentials are missing.
- The user wants production mode but only test credentials are provided.
- Enabling a provider would disable another online card provider and the user did not explicitly ask for that switch.

Proceed when:

- The provider and mode are clear.
- Required credentials are supplied or already stored.
- The user explicitly asks to enable one supported provider.

## PayNow 7-ELEVEN Frozen Pickup and Pay

1. Select the correct shop in the merchant MCP and call `slimweb_payment_logistics_get`. Check the active provider, environment, PayNow credential presence, sender details, and store channels. Ask the merchant to confirm that the PayNow account for the intended environment has **7-ELEVEN frozen cash collection (冷凍取貨付款／代收)** enabled. If they are unsure, guide them to confirm in the PayNow merchant logistics dashboard or with PayNow support before turning on the SlimWeb option. An enabled frozen shipping channel alone does not confirm cash collection.
2. When the merchant requests activation and confirms cash collection, call `slimweb_payment_logistics_update` with a `payments` entry for `provider: paynow`, the intended `mode`, `is_enabled: true`, and `seven_frozen_cod_enabled: true`. Include `seven_frozen` in `store_types`, retaining the other selected channels. Reuse stored credentials and sender details. If a different provider is active, wait for the merchant's explicit request to switch before sending the activation update with `switch_primary_to: paynow`. An `activation_deferred` result means the new provider was saved for later activation.
3. Read the settings again to verify that PayNow, the intended environment, the frozen channel, and the cash collection option are active. Guide the merchant through [saving the PayNow logistics callback](#paynow-logistics-callback).
4. Verify that the storefront checkout offers **7-ELEVEN 冷凍取貨付款** after activation. Report whether the PayNow URL was saved and whether a real shipment callback was verified. A visible checkout option alone does not establish that PayNow cash collection or status delivery works.

## PayNow Black Cat Home Delivery

1. Select the correct shop and call `slimweb_payment_logistics_get`. Ask the merchant to confirm **黑貓宅急便－宅配** is active for the intended PayNow account and environment. Confirm the PayNow merchant ID, payment transaction password and logistics API password are configured for that environment.
2. To enable it through `slimweb_payment_logistics_update`, use a `payments` entry with `provider: paynow`, the intended `mode`, `is_enabled: true`, and `black_cat_enabled: true`. Supply or retain `sender_name`, `sender_phone`, `sender_email`, and the dispatch `sender_address`. Preserve existing pickup channels and use `switch_primary_to: paynow` only after an explicit switch request. In SlimWeb's dashboard, the equivalent switch is **已開通 PayNow 黑貓宅配** under **系統管理 → 金流物流 → PayNow**.
3. Read back the active environment and `paynow_logistics.settings.black_cat_enabled`. Guide the merchant through [saving the PayNow logistics callback](#paynow-logistics-callback).
4. Verify the storefront offers online payment with Black Cat home delivery and all three temperatures (常溫、冷藏、冷凍). The shopper selects the temperature at checkout. For a paid order, use the PayNow action in the order's `available_actions` with `slimweb_orders_create_logistics`. Supply the actual `weight` in kg and `length`, `width`, and `height` in cm. SlimWeb uses the order's temperature.

## PayNow Logistics Callback

For both Black Cat and frozen pickup and pay, copy the shop-specific `callback_urls.logistics.paynow.notify_url` from `slimweb_payment_logistics_get` or the PayNow logistics **回傳網址** section in SlimWeb. In the matching **PayNow 物流後台** environment, open **分店管理 → 分店列表 → 修改 → 分店服務設定**, then paste the URL into **服務貨態回傳網址** (also labeled **貨態回傳網址**) and save. The merchant performs this step in PayNow. If the field is hidden or locked, have the merchant ask PayNow support to set it for that branch. Leave the separate store-selection (店號) and payment notification fields alone when configuring logistics status. [PayNow logistics documentation](https://paynow-co.github.io/paynow-guideline/docs/api-reference/)

## ECPay 7-ELEVEN Frozen Store Pickup

1. Select the correct shop and call `slimweb_payment_logistics_get`. Confirm the merchant's ECPay logistics account has **7-ELEVEN 冷凍店取 B2C** enabled in the intended environment. Check whether the shop already uses ECPay C2C before changing its logistics type.
2. With `slimweb_payment_logistics_update`, use a `logistics` entry with `provider: ecpay`, `logistics_type: b2c`, and `seven_frozen` in `store_types`. Retain other channels supported by the merchant's B2C contract. Supply or retain the logistics merchant ID and sender name, phone, ZIP code, and address. ECPay logistics follows ECPay payment's enabled state and mode. If ECPay is off and the merchant requests activation, include a `payments` entry with `provider: ecpay`, the intended `mode`, and `is_enabled: true`. Apply the explicit switch rule if a different primary provider is active. If separate logistics credentials are required and unavailable in the tool schema, guide the merchant to **系統管理 → 金流物流 → 綠界 ECPay** in SlimWeb to enter them.
3. Read back the active ECPay mode, B2C setting, and frozen channel. SlimWeb sends the shop's `callback_urls.logistics.ecpay.notify_url` as `ServerReplyURL` when it creates each shipment. The merchant can use the URL to check or troubleshoot delivery, and no separate entry in the ECPay portal is needed for this SlimWeb flow. [ECPay logistics status notification](https://developers.ecpay.com.tw/10127/)
4. Verify checkout offers **7-ELEVEN 冷凍** and opens the frozen store map. Use the ECPay action in the order's `available_actions` to create an authorized shipment. Report whether the store map, shipment creation, or an actual status callback was verified. The ECPay test environment does not simulate logistics status notifications. [ECPay shipment creation](https://developers.ecpay.com.tw/10118/)

## Manual Bank Transfer

1. Select the correct shop and read `slimweb_payment_logistics_get`. For an authorized change, call `slimweb_payment_logistics_update` with a `payments` entry for `provider: offline`. Use `is_enabled` to enable or disable it and use `bank_code` (three digits) and `bank_account` (receiving account digits) as strings so leading zeros are preserved. Both values must be valid when enabled. Omit fields the merchant wants to retain. Disabling preserves the receiving details. Bank transfer can operate alongside the active online card provider.
2. Read back the enabled status, bank code, and masked account information. If the connected server's schema lacks these fields, guide the merchant to **系統管理 → 金流物流 → 轉帳匯款** in the SlimWeb dashboard.
3. Verify **轉帳匯款** at checkout displays the receiving bank code and account and requires the last five digits of the sender's account (匯款帳號末五碼). The order stays unpaid until the merchant reconciles the bank deposit and clicks **確認付款** in the order details.
4. Bank transfer has no payment callback of its own. If the order later uses a logistics provider, follow that provider's logistics callback workflow.
