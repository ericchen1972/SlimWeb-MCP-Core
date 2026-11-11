import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createRequestHandler } from '../src/app.js';
import { createToolProfile } from '../src/toolProfile.js';

const uri = 'slimweb://guides/merchant-capabilities';
async function withRpc(run, toolProfile) {
  const server = createServer(createRequestHandler({
    accountRepository: {}, sessionSecret: 'capability-test', toolProfile
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const rpc = async (method, params = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/mcp`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    return response.json();
  };
  try { await run(rpc); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('clients discover and read the complete merchant capability guide without installing a Skill', async () => {
  await withRpc(async rpc => {
    const initialized = await rpc('initialize');
    assert.match(initialized.result.instructions, /Before declaring.*unsupported/i);
    assert.match(initialized.result.instructions, /quantity_discounts/);
    assert.match(initialized.result.instructions, /slimweb_product_add_ons_list/);
    assert.match(initialized.result.instructions, /slimweb_threshold_gifts_list/);
    const listed = await rpc('resources/list');
    assert.ok(listed.result.resources.some(resource => resource.uri === uri));
    const read = await rpc('resources/read', { uri });
    const guide = read.result.contents[0];
    assert.equal(guide.mimeType, 'text/markdown');
    assert.match(guide.text, /買四送一/);
    assert.match(guide.text, /滿額贈禮/);
    assert.match(guide.text, /加購商品/);
    const tools = (await rpc('tools/list')).result.tools;
    for (const tool of tools) assert.ok(guide.text.includes('`' + tool.name + '`'), tool.name);
    assert.match(guide.text, /variant_mode=different_price/);
    assert.match(guide.text, /5、6、10/);
    assert.match(guide.text, /not exposed|未開放/);
    assert.match(guide.text, /unknown|未知/);
  });
});

test('capability discovery preserves deployment-specific instructions and does not enable hidden tools', async () => {
  await withRpc(async rpc => {
    const initialized = await rpc('initialize');
    assert.match(initialized.result.instructions, /INSTALLATION-SPECIFIC/);
    assert.match(initialized.result.instructions, /Before declaring.*unsupported/i);
    assert.match(initialized.result.instructions, /current tools\/list/);
    const tools = (await rpc('tools/list')).result.tools;
    assert.deepEqual(tools.map(tool => tool.name), ['slimweb_sites_list']);
    const badResource = await rpc('resources/read', { uri: 'slimweb://unknown' });
    assert.equal(badResource.error.code, -32602);
  }, createToolProfile({ enabledTools: ['slimweb_sites_list'], serverGuidelines: 'INSTALLATION-SPECIFIC' }));
});
