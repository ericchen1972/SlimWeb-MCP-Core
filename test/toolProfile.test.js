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

  assert.equal(tools.length, 128);
  assert.equal(hash, '65a80a13c9945173f0b8169d3a4e02e5ef80524d4c67021ad67ddc8906a97eed');
});

test('member email is synchronous and newsletters have no recipient selector', async () => {
  const tools = await listTools();
  const send = tools.find((tool) => tool.name === 'slimweb_member_email_send');
  const createNewsletter = tools.find((tool) => tool.name === 'slimweb_newsletters_create');

  assert.deepEqual(send.inputSchema.required, ['site_code', 'member_ids', 'subject', 'rendered_html']);
  assert.equal(send.inputSchema.properties.cc_emails.maxItems, 5);
  assert.equal(createNewsletter.inputSchema.properties.recipient_scope, undefined);
  assert.equal(createNewsletter.inputSchema.properties.member_emails, undefined);
});

test('SaaS settings schema does not advertise removed member verification writes', async () => {
  const tools = await listTools();
  const settings = tools.find((tool) => tool.name === 'slimweb_settings_update');

  assert.equal(settings.inputSchema.properties.member_verification, undefined);
});

test('mail delivery schema exposes SMTP availability context and AI marketing settings', async () => {
  const tools = await listTools();
  const read = tools.find((tool) => tool.name === 'slimweb_mail_delivery_settings_get');
  const update = tools.find((tool) => tool.name === 'slimweb_mail_delivery_settings_update');

  assert.match(read.description, /mail server availability/i);
  assert.equal(update.inputSchema.properties.use_ai_marketing_email.type, 'boolean');
  assert.equal(update.inputSchema.properties.ai_marketing_email_interval_days.type, 'integer');
  assert.equal(update.inputSchema.properties.ai_marketing_email_interval_days.minimum, 7);
});

test('Theme tools advertise wide-desktop and viewport-overlay safety checks', async () => {
  const tools = await listTools();
  const createDefault = tools.find((tool) => tool.name === 'slimweb_themes_create_from_default');
  const clone = tools.find((tool) => tool.name === 'slimweb_themes_create_from_theme');
  const context = tools.find((tool) => tool.name === 'slimweb_theme_shell_get_context');
  const update = tools.find((tool) => tool.name === 'slimweb_themes_update_root_elements');
  const upsert = tools.find((tool) => tool.name === 'slimweb_theme_style_profile_upsert');
  const append = tools.find((tool) => tool.name === 'slimweb_theme_style_profile_append_request');

  assert.match(createDefault.description, /does not copy.*Default.*root/i);
  assert.deepEqual(clone.inputSchema.required, ['site_code', 'source_theme_id', 'name']);
  assert.equal(clone.inputSchema.properties.source_theme_id.type, 'integer');
  assert.match(clone.description, /non-Default/i);
  assert.match(context.description, /1536.*1800/);
  assert.match(context.description, /backdrop-filter.*filter.*transform.*contain.*perspective/i);
  assert.match(context.description, /overlay.*viewport-bound/i);
  assert.match(update.description, /same row.*header height/i);
  assert.match(update.description, /viewport-bound auth.*mobile-menu.*cart overlays/i);
  assert.equal(update.inputSchema.properties.confirmed_active_theme_edit.type, 'boolean');
  assert.equal(upsert.inputSchema.properties.confirmed_active_theme_edit.type, 'boolean');
  assert.equal(append.inputSchema.properties.confirmed_active_theme_edit.type, 'boolean');
  assert.match(update.description, /Default.*immutable/i);
  assert.match(update.description, /active custom.*explicit confirmation/i);
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
