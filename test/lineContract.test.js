import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createRequestHandler } from '../src/app.js';
import { createSessionToken } from '../src/session.js';
import { SlimWebBackendRepository, BackendRepositoryError } from '../src/backendRepository.js';
import { createCapabilityToolProfile } from '../src/capabilityProfile.js';
const names = ['line_bot_settings_get','line_bot_settings_update','line_ai_settings_get','line_ai_settings_update','line_rich_menus_list','line_rich_menus_get','line_rich_menus_create','line_rich_menus_publish','line_rich_menus_delete'].map(x=>`slimweb_${x}`);
async function request(repository, method, params) {
 const secret='line-contract-test'; const server=createServer(createRequestHandler({accountRepository:repository,sessionSecret:secret}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try { return await (await fetch(`http://127.0.0.1:${server.address().port}/mcp`,{method:'POST',headers:{'content-type':'application/json',...(method==='tools/call'?{authorization:`Bearer ${createSessionToken({email:'owner@example.com',google_id:'owner'},secret)}`}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).json(); }
 finally { await new Promise(r=>server.close(r)); }
}
test('LINE catalog exposes bounded actions and separate review and publish',async()=>{
 const {result:{tools}}=await request({},'tools/list');
 assert.deepEqual(tools.filter(t=>t.name.startsWith('slimweb_line_')).map(t=>t.name),names);
 const create=tools.find(t=>t.name===names[6]);
 assert.ok(create.inputSchema.required.includes('idempotency_key'));
 assert.deepEqual(create.inputSchema.properties.areas.items.properties.action.oneOf.map(x=>x.properties.type.const),['uri','message','richmenuswitch','clipboard']);
 assert.match(create.description,/committed.*media_path/i);
 assert.equal(create.inputSchema.properties.name.maxLength,260);
 assert.equal(create.inputSchema.properties.image_path.maxLength,1024);
 assert.equal(create.inputSchema.properties.size.properties.height.maximum,1724);
 assert.match(create.description,/1\.45/);
 const switchSchema=create.inputSchema.properties.areas.items.properties.action.oneOf[2];
 assert.deepEqual(switchSchema.oneOf,[{required:['target_rich_menu_id']},{required:['target_menu_key']}]);
 assert.equal(create.inputSchema.properties.menu_key.pattern,'^[a-z0-9_-]{1,32}$');
 assert.ok(!tools.some(t=>/line.*history/.test(t.name)));
});
test('LINE repository binds actor site and propagates stable keys and partial settings',async()=>{
 const calls=[];const repo=new SlimWebBackendRepository({transport:{async request(op){calls.push(op);return {ok:true};}}});
 const actor={site:{site_code:'owned'}};
 await repo.updateLineBotSettings(actor,{site_id:4,site_code:'foreign',enabled:false});
 await repo.updateLineAiSettings(actor,{prompt:'new'});
 await repo.listLineRichMenus(actor,{});
 await repo.getLineRichMenu(actor,{rich_menu_id:'richmenu-one'});
 await repo.createLineRichMenu(actor,{idempotency_key:'create-001',areas:[{action:{type:'message',text:'hello'}}]});
 await repo.publishLineRichMenu(actor,{rich_menu_id:'richmenu-one',idempotency_key:'publish-001'});
 await repo.deleteLineRichMenu(actor,{rich_menu_id:'richmenu-one',idempotency_key:'delete-001'});
 assert.deepEqual(calls[0].body,{enabled:false});assert.deepEqual(calls[1].body,{prompt:'new'});
 assert.ok(calls.every(x=>x.permission==='integration_settings'&&x.path.startsWith('/internal/mcp/v1/sites/owned/')));
 assert.equal(calls[5].path,'/internal/mcp/v1/sites/owned/integrations/line-rich-menus/richmenu-one/publish');
 assert.equal(calls[5].idempotencyKey,'publish-001');assert.equal(calls[6].method,'DELETE');
 await assert.rejects(()=>repo.createLineRichMenu(actor,{}),/idempotency/i);
 await assert.rejects(()=>repo.createLineRichMenu(actor,{idempotency_key:'create-002',areas:[{action:{type:'postback'}}]}),/action/i);
 assert.equal(calls.length,7);
});
test('LINE dispatch requires integration permission and preserves backend readiness failures',async()=>{
 let calls=0;let permissions=['backend_ai_assistant'];
 const repo={async resolveAdminSiteForIdentity(){return {site_id:1,site_code:'owned',permissions};},async getLineBotSettings(){calls++;return {has_access_token:true};}};
 let result=await request(repo,'tools/call',{name:names[0],arguments:{site_code:'owned'}});
 assert.ok(result.error);assert.equal(calls,0);
 permissions.push('integration_settings');result=await request(repo,'tools/call',{name:names[0],arguments:{site_code:'owned'}});
 assert.equal(calls,1);assert.ok(result.result);
 repo.publishLineRichMenu=async()=>{throw new BackendRepositoryError('Verify webhook.',{code:'LINE_NOT_READY',status:422,details:{webhook_verified:false}});};
 result=await request(repo,'tools/call',{name:names[7],arguments:{site_code:'owned',rich_menu_id:'richmenu-one',idempotency_key:'publish-001'}});
 assert.equal(result.error.data.reason,'LINE_NOT_READY');assert.deepEqual(result.error.data.details,{webhook_verified:false});
});
test('LINE capability tools are separately enabled',()=>{
 const profile=createCapabilityToolProfile(['line_bot_settings_read','line_rich_menus_write']);
 assert.ok(profile.allows(names[0]));assert.ok(profile.allows(names[7]));assert.ok(!profile.allows(names[1]));
});
