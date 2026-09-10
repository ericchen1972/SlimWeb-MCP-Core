// Financial operations are deliberately separate from creating a reviewable draft.
const site = { site_id: { type: 'integer' } };
const id = { invoice_id: { type: 'integer', minimum: 1 } };
const key = { idempotency_key: { type: 'string', pattern: '^[A-Za-z0-9._:-]{8,128}$', description: 'Stable request key. Reuse the same key and payload for retries of this operation.' } };
const confirmed = { confirmed: { type: 'boolean', const: true, description: 'Set true only after the user explicitly requests this specific financial operation.' } };
function tool(name, description, properties = {}, required = [], destructive = false, readOnly = false) {
  return { name: `slimweb_${name}`, description, inputSchema: { type: 'object', additionalProperties: false, properties: { ...site, ...properties }, required: ['site_id', ...required] }, annotations: { readOnlyHint: readOnly, destructiveHint: destructive, idempotentHint: true, openWorldHint: true } };
}
export const INVOICE_TOOLS = [
  tool('invoice_settings_get', 'Read electronic invoice connection settings. Secret keys are never returned; only their presence is exposed.', {}, [], false, true),
  tool('invoice_settings_update', 'Update the separate electronic invoice provider connection. Blank secrets preserve saved keys. Enabling auto_issue_enabled permits automatic issuance for future eligible events only; require explicit user intent before enabling it or switching to production.', {
    provider: { type: 'string', enum: ['ecpay', 'ezpay'] }, mode: { type: 'string', enum: ['test', 'production'] }, is_enabled: { type: 'boolean' }, auto_issue_enabled: { type: 'boolean' }, merchant_id: { type: 'string', maxLength: 128 }, hash_key: { type: 'string', maxLength: 255 }, hash_iv: { type: 'string', maxLength: 255 }
  }, ['provider', 'mode', 'is_enabled', 'merchant_id'], true),
  tool('invoices_list', 'List invoices in the selected site. Test and production records remain distinct.', {
    order_id: { type: 'integer', minimum: 1 }, status: { type: 'string' }, provider: { type: 'string', enum: ['ecpay', 'ezpay'] }, mode: { type: 'string', enum: ['test', 'production'] }, keyword: { type: 'string' }, date_from: { type: 'string', format: 'date' }, date_to: { type: 'string', format: 'date' }, limit: { type: 'integer', minimum: 1, maximum: 100 }, offset: { type: 'integer', minimum: 0 }
  }, [], false, true),
  tool('invoices_get', 'Get an invoice snapshot and status, without provider credentials.', id, ['invoice_id'], false, true),
  tool('invoices_create', 'Create a reviewable invoice draft; never issues a tax invoice. Supply order_id to snapshot an order, or transaction_date, buyer and items for a standalone cash/manual sale. NTD tax-inclusive ordinary taxable 5% only; no configurable tax rate.', {
    ...key, order_id: { type: 'integer', minimum: 1 }, transaction_date: { type: 'string', format: 'date' },
    buyer: { type: 'object', additionalProperties: false, properties: Object.fromEntries(['name', 'email', 'phone', 'address', 'tax_id', 'carrier_number', 'donation_code'].map(name => [name, { type: 'string' }]).concat([['carrier_type', { type: 'string', enum: ['none', 'mobile', 'citizen', 'member', 'donation'] }]])) },
    items: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, quantity: { type: 'integer', minimum: 1 }, unit: { type: 'string' }, unit_price: { type: 'integer', minimum: 0 } }, required: ['name', 'quantity', 'unit_price'] } }
  }, ['idempotency_key']),
  tool('invoices_issue', 'Issue this reviewed draft with its original provider/environment. This can create a legal tax invoice in production. Require explicit user intent; never issue automatically merely because a draft exists. On unknown outcome use sync before any retry.', { ...id, ...key, ...confirmed }, ['invoice_id', 'idempotency_key', 'confirmed'], true),
  tool('invoices_sync', 'Query the original provider to reconcile invoice status after pending/unknown results. Does not issue a new invoice.', id, ['invoice_id']),
  tool('invoices_void', 'Void this issued invoice with an explicit reason and user intent. A consequential financial operation; does not automatically reissue.', { ...id, ...key, ...confirmed, reason: { type: 'string', minLength: 1, maxLength: 255 } }, ['invoice_id', 'idempotency_key', 'confirmed', 'reason'], true),
  tool('invoices_allowance', 'Create an allowance for this invoice with explicit user intent and reason. Amount is an integer NTD amount and cannot exceed the remaining invoice balance. Merchant must confirm prior buyer agreement and retain evidence. Refund/return status alone is not authorization.', { ...id, ...key, ...confirmed, buyer_agreed: { type: 'boolean', const: true, description: 'Merchant confirms prior buyer agreement to this allowance and retains evidence. Separate from confirming the operation.' }, amount: { type: 'integer', minimum: 1 }, reason: { type: 'string', minLength: 1, maxLength: 255 } }, ['invoice_id', 'idempotency_key', 'confirmed', 'buyer_agreed', 'amount', 'reason'], true)
];
export const INVOICE_METHODS = { slimweb_invoice_settings_get: 'getInvoiceSettings', slimweb_invoice_settings_update: 'updateInvoiceSettings', slimweb_invoices_list: 'listInvoices', slimweb_invoices_get: 'getInvoice', slimweb_invoices_create: 'createInvoice', slimweb_invoices_issue: 'issueInvoice', slimweb_invoices_sync: 'syncInvoice', slimweb_invoices_void: 'voidInvoice', slimweb_invoices_allowance: 'allowanceInvoice' };
