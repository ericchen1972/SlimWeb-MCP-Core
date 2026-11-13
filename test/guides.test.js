import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createRequestHandler } from '../src/app.js';
import { createCapabilityToolProfile } from '../src/capabilityProfile.js';
import { createTestServiceToken, testServiceResolver } from './fixtures.js';

const secret = 'guide-read-fixture';
async function withRpc(run, { authenticated = true, toolProfile } = {}) {
  const server = createServer(createRequestHandler({
    accountRepository: { async listSitesForAdminIdentity() { return []; } },
    sessionSecret: secret, verifiedServiceIdentityResolver: testServiceResolver(secret), toolProfile
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const rpc = async (method, params = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/mcp`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated ? {
        authorization: `Bearer ${createTestServiceToken({ email: 'guide@example.com', google_id: 'guide' }, secret)}`
      } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    return response.json();
  };
  try { await run(rpc); } finally { await new Promise(resolve => server.close(resolve)); }
}
const call = (rpc, arguments_ = {}) => rpc('tools/call', { name: 'slimweb_guides_get', arguments: arguments_ });

test('authenticated clients discover current guide catalog and exact hashed topic without site permission', async () => {
  await withRpc(async rpc => {
    const tool = (await rpc('tools/list')).result.tools.find(tool => tool.name === 'slimweb_guides_get');
    assert.ok(tool);
    assert.match((await rpc('tools/list')).result.tools.find(tool => tool.name === 'slimweb_sites_list').description, /operating-guide reads do not require site selection/);
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.match((await rpc('initialize')).result.instructions, /slimweb_guides_get/);
    const index = (await call(rpc)).result.structuredContent;
    assert.equal(index.topic, 'index');
    assert.equal(index.mime_type, 'application/json');
    assert.match(index.guide_version, /^sha256:[a-f0-9]{64}$/);
    assert.ok(index.topics.some(entry => entry.topic === 'overview'));
    assert.ok(index.topics.some(entry => entry.topic === 'capability-map'));
    const guide = (await call(rpc, { topic: 'overview' })).result.structuredContent;
    assert.equal(guide.guide_version, index.guide_version);
    assert.equal(guide.sha256, createHash('sha256').update(guide.content).digest('hex'));
    assert.match(guide.content, /SlimWeb/);
    const resource = await rpc('resources/read', { uri: 'slimweb://guides/overview' });
    assert.equal(resource.result.contents[0].text, guide.content);
    assert.ok((await rpc('resources/list')).result.resources.some(entry => entry.uri === 'slimweb://guides/index'));
  });
});

test('guide reads reject invalid topics and extra selectors without reading arbitrary paths', async () => {
  await withRpc(async rpc => {
    for (const args of [{ topic: '../session' }, { topic: 'https://example.com' }, { topic: 'unknown' }, { topic: 42 }, { topic: null }, { url: 'https://example.com' }]) {
      const result = await call(rpc, args);
      assert.equal(result.error?.code, -32602, JSON.stringify(result));
    }
    const resource = await rpc('resources/read', { uri: 'slimweb://guides/../session' });
    assert.equal(resource.error?.code, -32602);
  });
});

test('guide tool and resource content require authenticated identity', async () => {
  await withRpc(async rpc => {
    assert.equal((await call(rpc)).error?.data?.reason, 'AUTH_REQUIRED');
    assert.equal((await rpc('resources/read', { uri: 'slimweb://guides/overview' })).error?.data?.reason, 'AUTH_REQUIRED');
  }, { authenticated: false });
});

test('site-context restricted profiles include bootstrap guidance but not hidden mutations', async () => {
  await withRpc(async rpc => {
    const tools = (await rpc('tools/list')).result.tools;
    assert.ok(tools.some(tool => tool.name === 'slimweb_guides_get'));
    assert.equal(tools.some(tool => tool.name === 'slimweb_orders_delete'), false);
    assert.ok((await call(rpc)).result?.structuredContent?.guide_version);
  }, { toolProfile: createCapabilityToolProfile(['site_context']) });
});
