import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as auth from '../src/session.js';
const memory=()=>{const rows=new Map();return {async put(k,id,v,exp){if(rows.has(k+id))throw Object.assign(Error('exists'),{status:409});rows.set(k+id,{v,exp});},async get(k,id){const r=rows.get(k+id);return r?.exp>Date.now()/1000?r.v:null;},async take(k,id){const r=rows.get(k+id);rows.delete(k+id);return r?.exp>Date.now()/1000?r.v:null;}};};
const context=()=>({oauthStore:memory(),sessionSecret:'secret',publicBaseUrl:'https://mcp.example',resourceContext:{resourceUrl:b=>b+'/mcp',equals:(a,b)=>a===b}});
test('browser credentials cannot authenticate API and legacy sessions are rejected',async()=>{
 const c=context();assert.equal(typeof auth.issueBrowserSession,'function');
 const token=await auth.issueBrowserSession({email:'owner',backend_grant:'grant'},c,null);
 assert.equal(await auth.verifyDurableToken(token+'.extra',c,'browser_session',null),null);
 assert.equal(auth.verifySignedToken(token,c.sessionSecret).backend_grant,undefined);
 assert.equal(auth.verifySignedToken(token,c.sessionSecret).email,undefined);
 assert.equal(await auth.verifyDurableToken(token,c,'access',null),null);
 assert.equal((await auth.verifyDurableToken(token,c,'browser_session',null)).backend_grant,'grant');
 const legacy=auth.createSignedToken({typ:'session',email:'owner',exp:Date.now()/1000+7*86400},'secret');
 assert.equal(await auth.verifyDurableToken(legacy,c,'access',null),null);
 assert.equal(auth.createSessionToken,undefined);
 assert.equal(auth.verifySessionToken,undefined);
});

test('concurrent logout is idempotent and revokes all session descendants',async()=>{
 const c=context(), token=await auth.issueBrowserSession({email:'owner'},c,null);
 const session=await auth.verifyDurableToken(token,c,'browser_session',null);
 const pair=await auth.issueTokenFamily({email:'owner',session_id:session.jti},{client_id:'client',...auth.credentialBinding(c,null)},c);
 const outcomes=await Promise.allSettled([auth.logoutBrowserSession(token,c,null),auth.logoutBrowserSession(token,c,null)]);
 assert.deepEqual(outcomes.map(r=>r.status),['fulfilled','fulfilled']);
 assert.equal(await auth.verifyDurableToken(token,c,'browser_session',null),null);
 assert.equal(await auth.verifyDurableToken(pair.access_token,c,'access',null),null);
 assert.equal(await auth.rotateRefreshToken(pair.refresh_token,{client_id:'client',...auth.credentialBinding(c,null)},c),null);
});

test('logout never suppresses durable storage errors',async()=>{
 const c=context(), token=await auth.issueBrowserSession({email:'owner'},c,null);
 const originalPut=c.oauthStore.put.bind(c.oauthStore), originalGet=c.oauthStore.get.bind(c.oauthStore);
 c.oauthStore.put=async(kind,...args)=>{if(kind==='revoked_family')throw Object.assign(Error('storage unavailable'),{status:503});return originalPut(kind,...args);};
 c.oauthStore.get=async(kind,key)=>kind==='revoked_family'?{revoked:true}:originalGet(kind,key);
 await assert.rejects(auth.logoutBrowserSession(token,c,null),/storage unavailable/);
});
test('refresh rotation is atomic and replay revokes the winning token family',async()=>{
 const c=context();assert.equal(typeof auth.issueTokenFamily,'function');
 const binding={client_id:'client',issuer:c.publicBaseUrl,audience:c.publicBaseUrl+'/mcp',scope:'mcp',resource_context:null};
 const first=await auth.issueTokenFamily({email:'owner',backend_grant:'grant'},binding,c);
 assert.equal(first.expires_in,900);
 assert.equal(auth.verifySignedToken(first.access_token,c.sessionSecret).backend_grant,undefined);
 assert.equal(auth.verifySignedToken(first.access_token,c.sessionSecret).email,undefined);
 assert.equal((await auth.verifyDurableToken(first.access_token,c,'access',null)).backend_grant,'grant');
 assert.equal(await auth.rotateRefreshToken(first.refresh_token,{...binding,client_id:'wrong'},c),null);
 const outcomes=await Promise.all([auth.rotateRefreshToken(first.refresh_token,binding,c),auth.rotateRefreshToken(first.refresh_token,binding,c)]);
 assert.ok(outcomes.filter(Boolean).length<=1);
 assert.equal(await auth.verifyDurableToken(first.access_token,c,'access',null),null);
});

test('durable records enforce issuer, audience, scope, expiration and store availability',async()=>{
 const c=context(), binding={client_id:'client',...auth.credentialBinding(c,null)};
 const first=await auth.issueTokenFamily({email:'owner'},binding,c);
 assert.equal(await auth.verifyDurableToken(first.access_token,{...c,publicBaseUrl:'https://other.example'},'access',null),null);
 const original=c.oauthStore.get.bind(c.oauthStore);
 for(const patch of [{exp:0},{scope:'admin'},{audience:'https://other.example/mcp'},{client_id:''}]){
  c.oauthStore.get=async(kind,key)=>{const r=await original(kind,key);return kind==='access'&&r?{...r,...patch}:r;};
  assert.equal(await auth.verifyDurableToken(first.access_token,c,'access',null),null);
 }
 await assert.rejects(auth.verifyDurableToken(first.access_token,{...c,oauthStore:null},'access',null),/storage/);
});
