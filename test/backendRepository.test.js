import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SlimWebBackendRepository } from '../src/backendRepository.js';

const identity = {
  email: 'owner@example.com',
  google_id: 'google-sub',
  resource_context: 'shop.example.com'
};

const site = {
  site_id: 101,
  site_code: 'swcb_demo',
  name: 'Demo'
};

const actor = {
  ...identity,
  site_id: 101,
  permissions: ['system_admin'],
  site
};

function transportRecorder(responder = () => ({ ok: true })) {
  const requests = [];
  return {
    requests,
    transport: {
      async request(operation) {
        requests.push(structuredClone(operation));
        return responder(operation);
      }
    }
  };
}

test('backend repository maps Batch 1 reads to the shared resource contract', async () => {
  const { requests, transport } = transportRecorder(({ path }) => {
    if (path === '/internal/mcp/v1/sites') return { sites: [site] };
    if (path === '/internal/mcp/v1/site-context/resolve') {
      return { actor: { site_id: 101, permissions: ['system_admin'] }, site };
    }
    return { site, settings: {} };
  });
  const repository = new SlimWebBackendRepository({ transport });

  assert.deepEqual(await repository.listSitesForAdminIdentity(identity), [site]);
  assert.deepEqual(await repository.resolveAdminSiteForIdentity(identity, { site_code: 'swcb_demo' }), actor);
  await repository.getBasicSettings(actor);
  await repository.getSiteReadiness(actor, { include_optional: true });
  await repository.getSiteLaunchProgress(actor, {});
  await repository.getSeoSettings(actor);
  await repository.getContactSettings(actor);
  await repository.getDashboardSummary(actor);
  await repository.listAdmins(actor);

  assert.deepEqual(requests.map(({ method, path, tool, permission }) => [method, path, tool, permission]), [
    ['GET', '/internal/mcp/v1/sites', 'slimweb_sites_list', 'backend_ai_assistant'],
    ['POST', '/internal/mcp/v1/site-context/resolve', 'slimweb_site_select', 'backend_ai_assistant'],
    ['GET', '/internal/mcp/v1/sites/swcb_demo/settings/basic', 'slimweb_settings_get', 'basic_settings'],
    ['GET', '/internal/mcp/v1/sites/swcb_demo/operations/readiness?include_optional=true', 'slimweb_site_readiness_get', ''],
    ['GET', '/internal/mcp/v1/sites/swcb_demo/operations/launch-progress', 'slimweb_site_launch_progress_get', ''],
    ['GET', '/internal/mcp/v1/sites/swcb_demo/settings/seo', 'slimweb_seo_settings_get', 'seo_settings'],
    ['GET', '/internal/mcp/v1/sites/swcb_demo/settings/contact', 'slimweb_contact_settings_get', 'basic_settings'],
    ['GET', '/internal/mcp/v1/sites/swcb_demo/operations/dashboard-summary', 'slimweb_dashboard_summary', ''],
    ['GET', '/internal/mcp/v1/sites/swcb_demo/operations/admins', 'slimweb_admins_list', 'system_admin']
  ]);
});

test('backend repository maps Batch 1 mutations without site selectors', async () => {
  const { requests, transport } = transportRecorder(() => ({ ok: true, site }));
  const repository = new SlimWebBackendRepository({
    transport,
    idempotencyKeyFactory: () => 'batch1-idempotency-001'
  });

  await repository.updateBasicSettings(actor, { site_code: 'swcb_demo', name: 'New name' });
  await repository.updateSeoSettings(actor, { site_code: 'swcb_demo', seo_title: 'SEO' });
  await repository.updateContactSettings(actor, { site_code: 'swcb_demo', contact_email: 'shop@example.com' });
  await repository.upsertAdmin(actor, { site_code: 'swcb_demo', google_email: 'editor@example.com', permissions: ['basic_settings'] });
  await repository.deleteAdmin(actor, { site_code: 'swcb_demo', admin_id: 9 });

  assert.deepEqual(requests.map(({ method, path, body, idempotencyKey }) => [method, path, body, idempotencyKey]), [
    ['PATCH', '/internal/mcp/v1/sites/swcb_demo/settings/basic', { name: 'New name' }, 'batch1-idempotency-001'],
    ['PUT', '/internal/mcp/v1/sites/swcb_demo/settings/seo', { seo_title: 'SEO' }, 'batch1-idempotency-001'],
    ['PUT', '/internal/mcp/v1/sites/swcb_demo/settings/contact', { contact_email: 'shop@example.com' }, 'batch1-idempotency-001'],
    ['PUT', '/internal/mcp/v1/sites/swcb_demo/operations/admins', { google_email: 'editor@example.com', permissions: ['basic_settings'] }, 'batch1-idempotency-001'],
    ['DELETE', '/internal/mcp/v1/sites/swcb_demo/operations/admins/9', {}, 'batch1-idempotency-001']
  ]);
});

test('backend repository sends one synchronous member email with explicit cc and bcc', async () => {
  const { requests, transport } = transportRecorder(() => ({ sent: true, recipient_count: 3 }));
  const repository = new SlimWebBackendRepository({ transport, idempotencyKeyFactory: () => 'member-email-idempotency-001' });

  const result = await repository.sendMemberEmail(actor, {
    site_id: 101,
    member_ids: [7],
    cc_emails: ['copy@example.com'],
    bcc_emails: ['hidden@example.com'],
    subject: 'Order changed',
    rendered_html: '<p>Please wait two days.</p>'
  });

  assert.equal(result.sent, true);
  assert.deepEqual(requests[0], {
    method: 'POST',
    path: '/internal/mcp/v1/sites/swcb_demo/communications/member-email',
    identity: actor,
    tool: 'slimweb_member_email_send',
    permission: 'member_management',
    body: {
      member_ids: [7],
      cc_emails: ['copy@example.com'],
      bcc_emails: ['hidden@example.com'],
      subject: 'Order changed',
      rendered_html: '<p>Please wait two days.</p>'
    },
    idempotencyKey: 'member-email-idempotency-001'
  });
});

test('backend repository requires one injected transport', () => {
  assert.throws(
    () => new SlimWebBackendRepository(),
    /transport with request\(\) is required/i
  );
});

test('theme repository clones only explicit custom sources and blocks literal Default writes', async () => {
  const { requests, transport } = transportRecorder(() => ({ ok: true }));
  const repository = new SlimWebBackendRepository({
    transport,
    idempotencyKeyFactory: () => 'theme-idempotency-001'
  });

  await repository.createThemeFromTheme(actor, {
    site_code: 'swcb_demo',
    source_theme_id: 44,
    name: 'Next theme'
  });

  assert.deepEqual(requests[0], {
    method: 'POST',
    path: '/internal/mcp/v1/sites/swcb_demo/themes',
    identity: actor,
    tool: 'slimweb_themes_create_from_theme',
    permission: 'page_management_templates',
    idempotencyKey: 'theme-idempotency-001',
    body: { source_theme_id: 44, name: 'Next theme' }
  });

  for (const call of [
    () => repository.updateThemeRootElements(actor, { theme_id: 'default', fragments: { footer: '<footer />' } }),
    () => repository.upsertThemeStyleProfile(actor, { theme_id: 'DEFAULT', summary: 'Nope' }),
    () => repository.appendThemeStyleProfileRequest(actor, { theme_id: 'default', request: 'Nope' })
  ]) {
    await assert.rejects(call, /Default theme is immutable/i);
  }

  assert.equal(requests.length, 1);
});

test('page repository preserves nested HTML JavaScript and library declarations', async () => {
  const { requests, transport } = transportRecorder(() => ({ ok: true }));
  const repository = new SlimWebBackendRepository({
    transport,
    idempotencyKeyFactory: () => 'page-javascript-001'
  });
  const payload = {
    site_code: 'swcb_demo',
    page_name: 'index',
    content: {
      html: '<main class="swiper">Slides</main>',
      javascript: "new Swiper('.swiper');"
    },
    enabled_libraries: ['swiper']
  };

  await repository.updatePage(actor, payload);

  assert.deepEqual(requests[0].body, {
    page_name: 'index',
    content: payload.content,
    enabled_libraries: ['swiper']
  });
});


test('invoice operations preserve supplied retry keys and resolved site, separate settings permission', async () => {
  const { requests, transport } = transportRecorder();
  const repository = new SlimWebBackendRepository({ transport });
  await repository.getInvoiceSettings(actor);
  await repository.updateInvoiceSettings(actor, { site_code: 'foreign', provider: 'ecpay', mode: 'test', is_enabled: false });
  await repository.listInvoices(actor, { site_code: 'foreign', status: 'issued', order_id: 25, limit: 20 });
  await repository.getInvoice(actor, { invoice_id: 12 });
  await repository.createInvoice(actor, { site_code: 'foreign', idempotency_key: 'invoice-draft-001', buyer: {} });
  await repository.issueInvoice(actor, { invoice_id: 12, idempotency_key: 'invoice-issue-001', confirmed: true });
  await repository.syncInvoice(actor, { invoice_id: 12 });
  await repository.voidInvoice(actor, { invoice_id: 12, reason: 'Wrong buyer', idempotency_key: 'invoice-void-001', confirmed: true });
  await repository.allowanceInvoice(actor, { invoice_id: 12, amount: 100, buyer_agreed: true, reason: 'Partial refund', idempotency_key: 'invoice-allowance-001', confirmed: true });
  assert.ok(requests.every(r => r.path.startsWith('/internal/mcp/v1/sites/swcb_demo/commerce/')));
  assert.ok(requests.every(r => !r.body?.site_code));
  assert.equal(requests[0].permission, 'payments_shipping');
  assert.equal(requests[2].permission, 'invoices_management');
  assert.match(requests[2].path, /order_id=25/);
  assert.equal(requests[5].path, '/internal/mcp/v1/sites/swcb_demo/commerce/invoices/12/issue');
  assert.equal(requests[5].idempotencyKey, 'invoice-issue-001');
  assert.equal(requests[7].idempotencyKey, 'invoice-void-001');
  assert.equal(requests[8].body.amount, 100);
});

test('financial invoice mutations reject missing intent and missing stable retry keys before transport', async () => {
  const { requests, transport } = transportRecorder();
  const repository = new SlimWebBackendRepository({ transport });
  for (const method of ['issueInvoice', 'voidInvoice', 'allowanceInvoice']) {
    await assert.rejects(() => repository[method](actor, { invoice_id: 12, idempotency_key: 'invoice-intent-001' }), /explicit|confirm/i);
    await assert.rejects(() => repository[method](actor, { invoice_id: 12, confirmed: true }), /idempotency/i);
  }
  assert.equal(requests.length, 0);
});


test('allowance requires separate buyer agreement even when merchant confirms the operation', async () => {
  const { requests, transport } = transportRecorder();
  const repository = new SlimWebBackendRepository({ transport });
  await assert.rejects(() => repository.allowanceInvoice(actor, { invoice_id: 12, confirmed: true, idempotency_key: 'allowance-consent-001', amount: 100, reason: 'Refund' }), /buyer/i);
  assert.equal(requests.length, 0);
});
