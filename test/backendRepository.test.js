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
