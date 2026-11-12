import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {createRequestHandler} from '../src/app.js';
import {createTestServiceToken,testServiceResolver} from './fixtures.js';
const secret='permission-consistency-fixture';
async function run(permissions,fn,sites=null){
 const repository={async listSitesForAdminIdentity(){return sites??[{site_code:'swcb_demo',site_id:2,permissions}];},async resolveAdminSiteForIdentity(){return {site_code:'swcb_demo',site_id:2,permissions};},async deleteOrders(){return {deleted:[]};},async siteNotificationSubscription(){return {id:'should-not-be-reached'};}};
 const server=createServer(createRequestHandler({accountRepository:repository,sessionSecret:secret,verifiedServiceIdentityResolver:testServiceResolver(secret)}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const call=async(method,params={})=>await (await fetch(`http://127.0.0.1:${server.address().port}/mcp`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${createTestServiceToken({email:'staff@example.com',google_id:'staff'},secret)}`},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).json();
 try {await fn(call);}finally{await new Promise(r=>server.close(r));}
}
test('actual order permission discovers and executes deletion; invented aliases grant nothing',async()=>{
 await run(['backend_ai_assistant','orders_management'],async call=>{
  assert.ok((await call('tools/list')).result.tools.some(t=>t.name==='slimweb_orders_delete'));
  const result=await call('tools/call',{name:'slimweb_orders_delete',arguments:{site_code:'swcb_demo',order_nos:['fixture']}});
  assert.deepEqual(result.result?.structuredContent,{deleted:[]},JSON.stringify(result));
 });
 await run(['backend_ai_assistant','order_management','order_list'],async call=>{
  assert.equal((await call('tools/list')).result.tools.some(t=>t.name==='slimweb_orders_delete'),false);
 });
});
test('event subscription checks both current order and return permissions before repository execution',async()=>{
 await run(['backend_ai_assistant','orders_management'],async call=>{
  const result=await call('events/subscribe',{name:'site.notification',arguments:{site_code:'swcb_demo'},delivery:{mode:'webhook',url:'https://receiver.example.com/callback',secret:'whsec_'+Buffer.alloc(32).toString('base64')}});
  assert.equal(result.error?.data?.reason,'FORBIDDEN',JSON.stringify(result));
 });
});

test('all requirements are enforced per site and product push has conditional product permission',async()=>{
 const {operationAllowed}=await import('../src/operationPolicy.js');
 const staff=['backend_ai_assistant','integration_settings','member_list'];
 assert.equal(operationAllowed(staff,'slimweb_line_push_prepare',{messages:[{type:'text',text:'hello'}]}),true);
 assert.equal(operationAllowed(staff,'slimweb_line_push_prepare',{messages:[{product_id:12}]}),false);
 assert.equal(operationAllowed([...staff,'product_management'],'slimweb_line_push_prepare',{messages:[{product_id:12}]}),true);
 assert.equal(operationAllowed(['system_admin'],'unknown.operation'),false);
});

test('every advertised tool has one policy and every policy role is actually assignable',async()=>{
 const {OPERATION_POLICY,operationRequirement}=await import('../src/operationPolicy.js');
 const {readFileSync}=await import('node:fs');
 const server=createServer(createRequestHandler({accountRepository:{},sessionSecret:secret}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const result=await (await fetch(`http://127.0.0.1:${server.address().port}/mcp`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})})).json();
  for(const tool of result.result.tools)assert.ok(operationRequirement(tool.name),tool.name);
 }finally{await new Promise(r=>server.close(r));}
 const roles=new Set(OPERATION_POLICY.roles);
 for(const [operation,rule] of Object.entries(OPERATION_POLICY.operations))for(const role of [...rule.any,...rule.all])assert.ok(roles.has(role),`${operation}: ${role}`);
});

test('discovery cannot combine all requirements from unrelated sites',async()=>{
 await run([],async call=>{
  const tools=(await call('tools/list')).result.tools;
  assert.equal(tools.some(tool=>tool.name==='slimweb_line_push_prepare'),false);
 },[{site_code:'swcb_one',site_id:1,permissions:['backend_ai_assistant','integration_settings']},{site_code:'swcb_two',site_id:2,permissions:['backend_ai_assistant','member_list']}]);
});
