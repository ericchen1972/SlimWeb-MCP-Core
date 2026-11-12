import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {createRequestHandler} from '../src/app.js';
import {createTestServiceToken,testServiceResolver} from './fixtures.js';

const secret='tool-boundary-fixture';
async function serverFor(deleteOrders,run) {
 const actor={site_code:'swcb_demo',site_id:2,permissions:['system_admin']};
 const repository={async listSitesForAdminIdentity(){return [actor];},async resolveAdminSiteForIdentity(){return actor;},deleteOrders};
 const server=createServer(createRequestHandler({accountRepository:repository,sessionSecret:secret,verifiedServiceIdentityResolver:testServiceResolver(secret)}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const call=async orders=>await(await fetch(`http://127.0.0.1:${server.address().port}/mcp`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${createTestServiceToken({google_id:'staff',email:'staff@example.test'},secret)}`},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'slimweb_orders_delete',arguments:{site_code:'swcb_demo',order_nos:orders}}})})).json();
 try {await run(call);} finally {await new Promise(resolve=>server.close(resolve));}
}

test('actual HTTP tool boundary redacts both mirrors and preserves actionable human confirmation details',async()=>{
 await serverFor(async(_actor,args)=>{
  if(args.order_nos[0]==='approval')throw Object.assign(new Error('Human approval required'),{code:'confirmation_required',details:{confirmation_url:'https://shop.example.test/sites/site/security/approvals/fixed',approval_id:'fixed',notion_token:'must-not-leak'}});
  return {deleted:[],nested:{smtp_password:'must-not-leak',public_id:'keep'},hasNotionToken:true};
 },async call=>{
  const result=await call(['safe']);
  assert.equal(JSON.stringify(result).includes('must-not-leak'),false);
  assert.equal(result.result.structuredContent.nested.public_id,'keep');
  assert.equal(result.result.structuredContent.hasNotionToken,true);
  const pending=await call(['approval']);
  assert.equal(pending.error.data.reason,'confirmation_required');
  assert.equal(pending.error.data.details.approval_id,'fixed');
  assert.ok(pending.error.data.details.confirmation_url.startsWith('https://shop.example.test/'));
  assert.equal(JSON.stringify(pending).includes('must-not-leak'),false);
 });
});

test('actual HTTP tool ingress blocks a ninth concurrent repository operation',async()=>{
 let started=0,finish;
 const wait=new Promise(resolve=>{finish=resolve;});
 await serverFor(async()=>{started++;await wait;return {deleted:[]};},async call=>{
  const first=Array.from({length:8},()=>call(['safe']));
  for(let i=0;i<100&&started<8;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(started,8);
  const denied=await call(['safe']);
  assert.equal(denied.error.data.reason,'RATE_LIMIT_EXCEEDED');
  assert.ok(denied.error.data.details.retry_after>0);
  assert.equal(started,8);
  finish();
  for(const result of await Promise.all(first))assert.ok(result.result);
 });
});
