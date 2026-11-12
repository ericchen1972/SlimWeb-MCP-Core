import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {createRequestHandler} from '../src/app.js';
import {testStore} from './fixtures.js';

test('Google login rejects cross-site form JSON and foreign or null origins before verification',async()=>{
  let verified=0, bootstrapped=0;
  const profile={sub:'owner',email:'owner@example.com'};
  const server=createServer(createRequestHandler({publicBaseUrl:'https://mcp.example',sessionSecret:'login-test',oauthStore:testStore(),
    googleVerifier:{async verify(){verified++;return profile;}},
    accountRepository:{async bootstrapIdentity(){bootstrapped++;return {profile,backend_grant:'verified-grant',sites:[{site_code:'shop'}]};}}
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try {
    for(const headers of [
      {'content-type':'text/plain',origin:'https://evil.example'},
      {'content-type':'application/x-www-form-urlencoded',origin:'https://mcp.example'},
      {'content-type':'application/json',origin:'https://evil.example'},
      {'content-type':'application/json',origin:'null'}
    ]) {
      const response=await fetch(base+'/auth/google',{method:'POST',headers,body:JSON.stringify({credential:'attacker-credential'})});
      assert.equal(response.status,403);
      assert.equal(response.headers.get('set-cookie'),null);
    }
    assert.equal(verified,0);assert.equal(bootstrapped,0);
    for(const origin of ['https://mcp.example',undefined]) {
      const response=await fetch(base+'/auth/google',{method:'POST',headers:{'content-type':'application/json; charset=utf-8',...(origin?{origin}:{})},body:JSON.stringify({credential:'owner-proof'})});
      assert.equal(response.status,200);
      assert.ok(response.headers.get('set-cookie'));
    }
    assert.equal(verified,2);assert.equal(bootstrapped,2);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
