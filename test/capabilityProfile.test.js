import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { createRequestHandler } from '../src/app.js';
import { createCapabilityToolProfile } from '../src/capabilityProfile.js';

const PHASE1 = ['site_context', 'basic_settings_read', 'basic_settings_write'];
const BATCH1 = [
  ...PHASE1,
  'contact_settings_read',
  'contact_settings_write',
  'seo_settings_read',
  'seo_settings_write',
  'site_readiness_read',
  'site_launch_progress_read',
  'dashboard_summary_read',
  'admins_read',
  'admins_write'
];

const BATCH1_TOOLS = [
  'slimweb_auth_status',
  'slimweb_sites_list',
  'slimweb_site_select',
  'slimweb_site_readiness_get',
  'slimweb_site_launch_progress_get',
  'slimweb_seo_settings_get',
  'slimweb_seo_settings_update',
  'slimweb_contact_settings_get',
  'slimweb_contact_settings_update',
  'slimweb_dashboard_summary',
  'slimweb_settings_get',
  'slimweb_settings_update',
  'slimweb_admins_list',
  'slimweb_admins_upsert',
  'slimweb_admins_delete'
];

async function listTools(capabilities) {
  const server = createServer(createRequestHandler({
    accountRepository: { async listSitesForAdminIdentity() { return []; } },
    sessionSecret: 'test-session-secret',
    toolProfile: createCapabilityToolProfile(capabilities)
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    return (await response.json()).result.tools;
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('Phase 1 capabilities preserve five tools and name-only settings projection', async () => {
  const tools = await listTools(PHASE1);
  assert.deepEqual(tools.map(({ name }) => name), [
    'slimweb_auth_status',
    'slimweb_sites_list',
    'slimweb_site_select',
    'slimweb_settings_get',
    'slimweb_settings_update'
  ]);
  const settings = tools.find(({ name }) => name === 'slimweb_settings_update');
  assert.deepEqual(Object.keys(settings.inputSchema.properties), ['name', 'site_code']);
});

test('Batch 1 capabilities expose fifteen Core schemas in catalog order', async () => {
  const tools = await listTools(BATCH1);
  assert.deepEqual(tools.map(({ name }) => name), BATCH1_TOOLS);
  const settings = tools.find(({ name }) => name === 'slimweb_settings_update');
  assert.equal(settings.inputSchema.properties.logo.type, 'object');
  assert.equal(settings.inputSchema.properties.site_status.type, 'string');
});

test('capability profile fails closed for missing and unknown capabilities', async () => {
  const withoutSeoWrite = await listTools(BATCH1.filter((value) => value !== 'seo_settings_write'));
  assert.equal(withoutSeoWrite.some(({ name }) => name === 'slimweb_seo_settings_get'), true);
  assert.equal(withoutSeoWrite.some(({ name }) => name === 'slimweb_seo_settings_update'), false);
  assert.deepEqual(await listTools(['not_a_capability']), []);
});
