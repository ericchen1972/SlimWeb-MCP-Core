import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {createRequestHandler} from '../src/app.js';
import {createSessionToken} from '../src/session.js';
const secret='events-test-secret';
async function run(repository,fn,options={}){
 const server=createServer(createRequestHandler({accountRepository:repository,sessionSecret:secret,...options}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const call=async(method,params={},auth=true)=>{
 const r=await fetch(`http://127.0.0.1:${server.address().port}/mcp`,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:`Bearer ${createSessionToken({email:'owner@example.com',google_id:'owner-sub'},secret)}`}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 return {status:r.status,body:await r.json()};};
 try{await fn(call);}finally{await new Promise(r=>server.close(r));}
}
const repository={async listSitesForAdminIdentity(){return [{site_code:'swcb_demo',permissions:['system_admin']}];}};
test('discovery advertises events and authenticated catalog requires explicit site_code',async()=>{
 await run(repository,async call=>{
 const d=await call('server/discover');assert.ok(d.body.result.supportedVersions.includes('2026-07-28'));assert.deepEqual(d.body.result.capabilities.events,{});
 assert.equal((await call('events/list',{},false)).status,401);
 const r=await call('events/list');assert.equal(r.body.result.events.length,1);assert.equal(r.body.result.events[0].name,'site.notification');assert.deepEqual(r.body.result.events[0].inputSchema.required,['site_code']);
 });
});
test('subscription validates arguments and routes exact params through authenticated backend',async()=>{
 let received;
 await run({...repository,async siteNotificationSubscription(identity,params,action){received={identity,params,action};return {id:'sub_test',refreshBefore:null,cursor:null,truncated:false};}},async call=>{
 const p={name:'site.notification',arguments:{site_code:'swcb_demo'},delivery:{mode:'webhook',url:'https://receiver.example.com/callback',secret:'whsec_'+Buffer.alloc(32).toString('base64')}};
 assert.equal((await call('events/subscribe',{...p,arguments:{}})).body.error.code,-32602);
 assert.equal((await call('events/subscribe',p,false)).status,401);
 assert.equal((await call('events/subscribe',p)).body.result.id,'sub_test');assert.equal(received.identity.google_id,'owner-sub');assert.deepEqual(received.params,p);assert.equal(received.action,'subscribe');
 await call('events/unsubscribe',p);assert.equal(received.action,'unsubscribe');
 });
});
test('backend callback failures keep MCP CallbackEndpointError',async()=>{
 await run({...repository,async siteNotificationSubscription(){throw Object.assign(new Error('Callback verification failed'),{code:'CALLBACK_ENDPOINT_ERROR',details:{reason:'challenge_failed'}});}},async call=>{
 const p={name:'site.notification',arguments:{site_code:'swcb_demo'},delivery:{mode:'webhook',url:'https://receiver.example.com/callback',secret:'whsec_'+Buffer.alloc(32).toString('base64')}};
 const r=await call('events/subscribe',p);assert.equal(r.body.error.code,-32015);assert.equal(r.body.error.data.reason,'challenge_failed');
 });
});

test('2026 protocol requests return complete envelopes and server identity metadata',async()=>{
 await run(repository,async call=>{
  const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}};
  const r=await call('events/list',{_meta:meta});assert.equal(r.body.result.resultType,'complete');assert.equal(r.body.result._meta['io.modelcontextprotocol/serverInfo'].name,'slimweb-mcp');
 });
});
