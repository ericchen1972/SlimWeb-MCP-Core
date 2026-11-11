import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { createRequestHandler } from '../src/app.js';
import { BackendRepositoryError } from '../src/backendRepository.js';
import { createSessionToken } from '../src/session.js';

async function requestMcp(repository, body, authenticated = false) {
  const server = createServer(createRequestHandler({
    accountRepository: repository,
    sessionSecret: 'page-javascript-secret'
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const token = createSessionToken(
      { email: 'owner@example.com', name: 'Owner', google_id: 'owner-sub' },
      'page-javascript-secret'
    );
    const response = await fetch(`http://127.0.0.1:${server.address().port}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(authenticated ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
    return response.json();
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const actor = {
  site_id: 1,
  site_code: 'swcb_test',
  permissions: ['system_admin', 'backend_ai_assistant', 'page_management_pages']
};

test('page tools expose one formal JavaScript source contract', async () => {
  const payload = await requestMcp({ async listSitesForAdminIdentity() { return []; } }, {
    jsonrpc: '2.0', id: 1, method: 'tools/list'
  });
  const tools = payload.result.tools;
  const read = tools.find(({ name }) => name === 'slimweb_pages_get_content');
  const create = tools.find(({ name }) => name === 'slimweb_pages_create');
  const update = tools.find(({ name }) => name === 'slimweb_pages_update');

  assert.equal(create.inputSchema.properties.content.properties.javascript.type, 'string');
  assert.equal(create.inputSchema.properties.content.properties.javascript.maxLength, 102400);
  assert.match(create.description, /90-mcp-page\.js/i);
  assert.match(update.description, /omit.*preserve/i);
  assert.match(update.description, /empty.*delete/i);
  assert.match(update.description, /enabled_libraries/i);
  assert.match(read.description, /javascript_asset.*javascript_conflicts/i);
  assert.doesNotMatch(`${create.description} ${update.description}`, /inline JavaScript.*HTML/i);
});

test('page tool errors retain backend field and conflict details', async () => {
  const repository = {
    async resolveAdminSiteForIdentity() { return actor; },
    async updatePage() {
      throw new BackendRepositoryError('The request data is invalid.', {
        code: 'VALIDATION_FAILED',
        status: 422,
        details: { fields: { 'content.javascript': ['JavaScript contains unsupported markup.'] } }
      });
    }
  };
  const payload = await requestMcp(repository, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: {
      name: 'slimweb_pages_update',
      arguments: {
        site_code: 'swcb_test', page_name: 'index',
        content: { html: '<main>Home</main>', javascript: '<script>alert(1)</script>' },
        enabled_libraries: []
      }
    }
  }, true);

  assert.equal(payload.error.data.reason, 'VALIDATION_FAILED');
  assert.deepEqual(payload.error.data.details.fields['content.javascript'], ['JavaScript contains unsupported markup.']);
});

test('page JavaScript conflicts retain the backend conflict code and assets', async () => {
  const conflict = { path: 'sites/1/templates/default/pages/index/assets/js/90-migrated-inline.js' };
  const repository = {
    async resolveAdminSiteForIdentity() { return actor; },
    async updatePage() {
      throw new BackendRepositoryError('Page JavaScript conflict.', {
        code: 'CONFLICT',
        status: 409,
        details: { reason: 'PAGE_JAVASCRIPT_CONFLICT', conflicts: [conflict] }
      });
    }
  };
  const payload = await requestMcp(repository, {
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: {
      name: 'slimweb_pages_update',
      arguments: {
        site_code: 'swcb_test', page_name: 'index',
        content: { html: '<main>Home</main>', javascript: "new Swiper('.hero');" },
        enabled_libraries: ['swiper']
      }
    }
  }, true);

  assert.equal(payload.error.code, -32009);
  assert.equal(payload.error.data.reason, 'CONFLICT');
  assert.equal(payload.error.data.details.reason, 'PAGE_JAVASCRIPT_CONFLICT');
  assert.deepEqual(payload.error.data.details.conflicts, [conflict]);
});


test('logistics tools do not offer retired OK Mart', async () => {
  const payload = await requestMcp({ async listSitesForAdminIdentity() { return []; } }, {
    jsonrpc: '2.0', id: 1, method: 'tools/list'
  });
  const settings = payload.result.tools.find(tool => tool.name === 'slimweb_payment_logistics_update');
  const paynow = settings.inputSchema.properties.payments.items.properties;
  const paynowChannels = paynow.store_types.items;
  assert.ok(paynow.provider.enum.includes('offline'));
  assert.equal(paynow.bank_code.pattern, '^[0-9]{3}$');
  assert.equal(paynow.bank_account.pattern, '^[0-9]{1,32}$');
  const ecpayChannels = settings.inputSchema.properties.logistics.items.properties.store_types.items;
  assert.equal(paynow.black_cat_enabled.type, 'boolean');
  assert.equal(paynow.sender_address.type, 'string');
  assert.deepEqual(ecpayChannels.enum, ['seven', 'family', 'hilife', 'seven_frozen']);
  assert.equal(settings.inputSchema.properties.payments.items.properties.seven_frozen_cod_enabled?.type, 'boolean');
  assert.deepEqual(paynowChannels.enum, ['seven', 'family', 'hilife', 'ok', 'seven_frozen', 'family_frozen']);
  assert.ok(settings.inputSchema.properties.switch_primary_to.enum.includes('paynow'));
  const shipment = payload.result.tools.find(tool => tool.name === 'slimweb_orders_create_logistics');
  const shipmentChannels = shipment.inputSchema.properties.store_type;
  assert.ok(shipment.inputSchema.properties.provider.enum.includes('paynow'));
  assert.deepEqual(shipmentChannels.enum, ['seven', 'family', 'hilife', 'seven_frozen', 'family_frozen']);
  for (const field of ['weight', 'length', 'width', 'height']) {
    assert.equal(shipment.inputSchema.properties[field].type, 'number');
  }
  let checked = 2; // Settings and forward shipment channels are checked above.
  function check(node) {
    if (!node || typeof node !== 'object' || node === paynowChannels || node === shipmentChannels || node === ecpayChannels) return;
    if (Array.isArray(node.enum) && node.enum.includes('seven')) {
      checked++;
      assert.deepEqual(node.enum, ['seven', 'family', 'hilife']);
    }
    Object.values(node).forEach(check);
  }
  payload.result.tools.forEach(tool => check(tool.inputSchema));
  assert.ok(checked >= 2);
});
