import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createRequestHandler } from '../src/app.js';
import { BackendRepositoryError } from '../src/backendRepository.js';
import { createSessionToken } from '../src/session.js';

async function request(repository, method, params) {
  const secret = 'site-ai-contract-secret';
  const server = createServer(createRequestHandler({ accountRepository: repository, sessionSecret: secret }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(method === 'tools/call' ? { authorization: `Bearer ${createSessionToken({ email: 'owner@example.com', google_id: 'owner' }, secret)}` } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    return response.json();
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('catalog distinguishes server generation from client-authored content without requiring site AI configuration', async () => {
  const payload = await request({}, 'tools/list');
  const tools = payload.result.tools;
  assert.ok(tools.some(tool => tool.name === 'slimweb_pages_create'));
  assert.ok(tools.some(tool => tool.name === 'slimweb_products_list'));
  assert.match(tools.find(tool => tool.name === 'slimweb_posters_create').description, /site.*AI provider.*API key/i);
  assert.match(tools.find(tool => tool.name === 'slimweb_newsletters_create').description, /does not require.*site AI/i);
});

test('poster configuration failures retain backend code and details without generation fallback', async () => {
  let calls = 0;
  const repository = {
    async resolveAdminSiteForIdentity() {
      return { site_id: 1, site_code: 'swcb_test', permissions: ['system_admin', 'backend_ai_assistant', 'product_management_products'] };
    },
    async createPoster() {
      calls++;
      throw new BackendRepositoryError('Configure the site AI provider and API key.', {
        code: 'AI_NOT_CONFIGURED', status: 422, details: { provider: 'none' }
      });
    }
  };
  const payload = await request(repository, 'tools/call', {
    name: 'slimweb_posters_create',
    arguments: { site_code: 'swcb_test', product_names: ['Watch'], drawing_prompt: 'A watch poster' }
  });
  assert.equal(calls, 1);
  assert.equal(payload.error.data.reason, 'AI_NOT_CONFIGURED');
  assert.deepEqual(payload.error.data.details, { provider: 'none' });
});
