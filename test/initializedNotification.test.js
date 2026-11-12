import {testServiceResolver} from './fixtures.js';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createRequestHandler } from '../src/app.js';
import { createToolProfile } from '../src/toolProfile.js';
import { createTestServiceToken } from './fixtures.js';

async function withServer(run, toolProfile, options = {}) {
  const server = createServer(createRequestHandler({verifiedServiceIdentityResolver:testServiceResolver('initialized-test'), accountRepository: {}, sessionSecret: 'initialized-test', toolProfile, ...options }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const post = (message, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/mcp`, {method:'POST', headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...headers},body:JSON.stringify(message)});
  try { await run(post); } finally { await new Promise(resolve => server.close(resolve)); }
}

for (const version of ['2025-03-26', '2026-07-28']) {
  for (const restricted of [false, true]) {
    test(`initialized is accepted with an empty 202 response, then discovery stays usable (${version}, restricted=${restricted})`, async () => {
      await withServer(async post => {
        const init = await post({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:version,capabilities:{},clientInfo:{name:'fresh-http-client',version:'1'}}});
        assert.equal((await init.json()).result.protocolVersion,version);
        const before = await (await post({jsonrpc:'2.0',id:2,method:'tools/list'})).json();
        for (const params of [undefined, {}]) {
          const response = await post({jsonrpc:'2.0',method:'notifications/initialized',params},{'mcp-protocol-version':version});
          assert.equal(response.status,202);
          assert.equal(await response.text(),'');
          assert.equal(response.headers.get('content-type'),null);
        }
        const after = await (await post({jsonrpc:'2.0',id:3,method:'tools/list'})).json();
        assert.deepEqual(after.result.tools,before.result.tools);
        if (restricted) assert.deepEqual(after.result.tools.map(t=>t.name),['slimweb_sites_list']);
        const guide = await (await post({jsonrpc:'2.0',id:4,method:'resources/read',params:{uri:'slimweb://guides/merchant-capabilities'}})).json();
        assert.equal(guide.result.contents[0].mimeType,'text/markdown');
        const protectedCall = await post({jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'slimweb_sites_list',arguments:{}}});
        assert.equal(protectedCall.status,401);
        const unknown = await (await post({jsonrpc:'2.0',id:6,method:'not/a/method'})).json();
        assert.equal(unknown.error.code,-32601);
      }, restricted ? createToolProfile({enabledTools:['slimweb_sites_list']}) : undefined);
    });
  }
}

test('initialized with an id is rejected as an invalid request, not accepted as a notification', async () => {
 await withServer(async post => {
  for (const id of [0,1,null]) {
   const response = await post({jsonrpc:'2.0',id,method:'notifications/initialized'});
   assert.equal(response.status,200);
   const body = await response.json();assert.equal(body.id,id);assert.equal(body.error.code,-32600);
  }
 });
});

test('malformed initialized notifications are rejected with HTTP 400', async () => {
 await withServer(async post => {
  for(const input of [{method:'notifications/initialized'},{jsonrpc:'1.0',method:'notifications/initialized'},{jsonrpc:'2.0',method:'notifications/initialized',params:[]},{jsonrpc:'2.0',method:'notifications/initialized',params:null}]){
   const response=await post(input);assert.equal(response.status,400);assert.equal((await response.json()).error.code,-32600);
  }
 });
});

test('initialized preserves authenticated resource binding before notification acceptance', async () => {
 const provider={parse:()=> 'second.example.com',equals:(a,b)=>a===b};
 await withServer(async post => {
  for(const [domain,status] of [['first.example.com',401],['second.example.com',202]]){
   const token=createTestServiceToken({email:'owner@example.test',google_id:'test'},'initialized-test',Date.now(),{resource_context:domain});
   const response=await post({jsonrpc:'2.0',method:'notifications/initialized'},{authorization:'Bearer '+token});
   assert.equal(response.status,status);
   if(status===401) assert.equal((await response.json()).error.data.reason,'DOMAIN_SESSION_MISMATCH');
   else assert.equal(await response.text(),'');
  }
 },undefined,{resourceContext:provider});
});
