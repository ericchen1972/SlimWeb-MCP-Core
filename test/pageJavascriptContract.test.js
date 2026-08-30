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
