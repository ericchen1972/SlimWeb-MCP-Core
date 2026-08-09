import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { createRequestHandler } from '../src/app.js';
import { createToolProfile } from '../src/toolProfile.js';

const STANDALONE_TOOLS = [
  'slimweb_auth_status',
  'slimweb_sites_list',
  'slimweb_site_select',
  'slimweb_settings_get',
  'slimweb_settings_update'
];

const repository = {
  async listSitesForAdminIdentity() {
    return [];
  }
};

async function listTools(toolProfile = createToolProfile(), toolProfileResolver = null) {
  const server = createServer(createRequestHandler({
    accountRepository: repository,
    sessionSecret: 'test-session-secret',
    toolProfile,
    toolProfileResolver
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    const payload = await response.json();
    return payload.result.tools;
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('default tool profile preserves the SaaS contract', async () => {
  const tools = await listTools();
  const hash = createHash('sha256').update(JSON.stringify(tools)).digest('hex');

  assert.equal(tools.length, 125);
  assert.equal(hash, 'e5e4c662fd241829f532d1a567987698ad6a16e22759dfdea6eeea6c44c7e95b');
});

test('SaaS settings schema does not advertise removed member verification writes', async () => {
  const tools = await listTools();
  const settings = tools.find((tool) => tool.name === 'slimweb_settings_update');

  assert.equal(settings.inputSchema.properties.member_verification, undefined);
});

test('Standalone tool profile advertises exactly five tools', async () => {
  const tools = await listTools(createToolProfile({ enabledTools: STANDALONE_TOOLS }));

  assert.deepEqual(tools.map((tool) => tool.name), STANDALONE_TOOLS);
});

test('Standalone settings schema projects selector and name only', async () => {
  const tools = await listTools(createToolProfile({
    enabledTools: STANDALONE_TOOLS,
    schemaProjections: {
      slimweb_settings_update: ['site_id', 'name']
    }
  }));
  const settings = tools.find((tool) => tool.name === 'slimweb_settings_update');

  assert.deepEqual(Object.keys(settings.inputSchema.properties), ['name', 'site_code']);
  assert.deepEqual(settings.inputSchema.required, ['site_code']);
});

test('filtered tools are rejected before dispatch', () => {
  const profile = createToolProfile({ enabledTools: STANDALONE_TOOLS });

  assert.equal(profile.allows('slimweb_settings_update'), true);
  assert.equal(profile.allows('slimweb_orders_delete'), false);
});

test('tools list can resolve a profile for the current resource context', async () => {
  const resolved = createToolProfile({ enabledTools: ['slimweb_auth_status'] });
  const tools = await listTools(
    createToolProfile({ enabledTools: STANDALONE_TOOLS }),
    async ({ session, resourceContext }) => {
      assert.equal(session, null);
      assert.equal(resourceContext, null);
      return resolved;
    }
  );

  assert.deepEqual(tools.map(({ name }) => name), ['slimweb_auth_status']);
});
