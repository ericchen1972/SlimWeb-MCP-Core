import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createRequestHandler } from '../src/app.js';
import {
  createSignedToken,
  issueBrowserSession, verifySignedToken, verifyDurableToken, issueTokenFamily, credentialBinding,
} from '../src/session.js';
const secret = 'oauth-security-test';
let session = '';
function store() {
  const m = new Map();
  return {
    async put(k, id, v, exp) {
      m.set(k + id, { value: v, exp });
    },
    async get(k, id) {
      const r = m.get(k + id);
      return r && r.exp > Date.now() / 1000 ? r.value : null;
    },
    async take(k, id) {
      const r = m.get(k + id);
      m.delete(k + id);
      return r && r.exp > Date.now() / 1000 ? r.value : null;
    },
  };
}
async function run(fn, shared = store(), options = {}) {
  if (shared) session = await issueBrowserSession({email: 'owner@example.com', google_id: 'owner'}, {oauthStore:shared,sessionSecret:secret,publicBaseUrl:'',resourceContext:{resourceUrl:()=>'/mcp'}}, null);
  const server = createServer(
    createRequestHandler({
      accountRepository: {
        async listSitesForAdminIdentity() {
          return [
            {
              site_code: 'swcb_a',
              name: 'Shop',
              permissions: ['system_admin'],
            },
          ];
        },
      },
      sessionSecret: secret,
      oauthStore: shared,
      ...options,
    }),
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (p, opts = {}) =>
    fetch(base + p, { redirect: 'manual', ...opts });
  try {
    await fn(call);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
const post = (body) => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    cookie: 'swmcp_session=' + session,
  },
  body: JSON.stringify(body),
});
const verifier = 'a'.repeat(43),
  challenge = createHash('sha256').update(verifier).digest('base64url');
const redirect = 'https://client.example/callback';
async function register(call) {
  return (
    await (
      await call(
        '/oauth/register',
        post({ redirect_uris: [redirect], client_name: 'Client' }),
      )
    ).json()
  ).client_id;
}
function params(client, extra = {}) {
  return new URLSearchParams({
    response_type: 'code',
    client_id: client,
    redirect_uri: redirect,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'state',
    ...extra,
  });
}
async function consent(call, client, extra = {}) {
  const r = await call('/oauth/authorize?' + params(client, extra), {
    headers: { cookie: 'swmcp_session=' + session, 'accept-language': 'en' },
  });
  assert.equal(r.status, 200);
  const html = await r.text();
  const token = html.match(/name="consent_token" value="([^"]+)"/)?.[1];
  assert.ok(token);
  return token;
}
async function code(call, client) {
  const token = await consent(call, client);
  const r = await call(
    '/oauth/authorize',
    post({ consent_token: token, decision: 'allow' }),
  );
  assert.equal(r.status, 302);
  return new URL(r.headers.get('location')).searchParams.get('code');
}
test('authorization codes and legacy sessions cannot authorize browser or API requests',async()=>{
  const context={sessionSecret:secret,oauthStore:store(),publicBaseUrl:'',resourceContext:{resourceUrl:()=>'/mcp',equals:(a,b)=>a===b}};
  for(const typ of ['oauth_code','session']) {
    const token=createSignedToken({typ,email:'owner',exp:Date.now()/1000+7*86400},secret);
    for(const purpose of ['browser_session','access']) assert.equal(await verifyDurableToken(token,context,purpose,null),null);
  }
});
test('OAuth rejects unknown redirect and optional or plain PKCE before login', async () =>
  run(async (call) => {
    const client = await register(call);
    for (const extra of [
      { redirect_uri: 'https://evil.example/' },
      { code_challenge: '' },
      { code_challenge_method: 'plain' },
      { client_id: 'unknown' },
    ]) {
      const r = await call('/oauth/authorize?' + params(client, extra));
      assert.equal(r.status, 400);
      assert.equal(r.headers.get('location'), null);
    }
  }));
test('OAuth consent, strict client binding, code replay and direct code use', async () =>
  run(async (call) => {
    const client = await register(call);
    const c = await code(call, client);
    assert.equal(
      (
        await call('/mcp', {
          ...post({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'slimweb_sites_list', arguments: {} },
          }),
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + c,
          },
        })
      ).status,
      401,
    );
    const body = {
      grant_type: 'authorization_code',
      code: c,
      client_id: client,
      redirect_uri: redirect,
      code_verifier: verifier,
    };
    assert.equal(
      (await call('/oauth/token', post({ ...body, client_id: '' }))).status,
      400,
    );
    assert.equal(
      (await call('/oauth/token', post({ ...body, code_verifier: 'wrong' })))
        .status,
      400,
    );
    const responses = await Promise.all([
      call('/oauth/token', post(body)),
      call('/oauth/token', post(body)),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400]);
    const good = await responses.find((r) => r.status === 200).json();
    assert.equal(verifySignedToken(good.access_token, secret)?.typ, 'access');
    assert.equal(good.expires_in, 900);
    assert.ok(good.refresh_token);
  }));
test('OAuth consent rejects CSRF, cannot alter redirect, supports denial and is single use', async () =>
  run(async (call) => {
    const client = await register(call);
    const token = await consent(call, client);
    assert.equal(
      (
        await call(
          '/oauth/authorize',
          post({ consent_token: 'bogus', decision: 'allow' }),
        )
      ).status,
      400,
    );
    const denied = await call(
      '/oauth/authorize',
      post({
        consent_token: token,
        decision: 'deny',
        redirect_uri: 'https://evil.example/',
      }),
    );
    assert.equal(
      new URL(denied.headers.get('location')).origin,
      'https://client.example',
    );
    assert.equal(
      new URL(denied.headers.get('location')).searchParams.get('error'),
      'access_denied',
    );
    assert.equal(
      (
        await call(
          '/oauth/authorize',
          post({ consent_token: token, decision: 'allow' }),
        )
      ).status,
      400,
    );
  }));
test('OAuth refuses operation without persistent store', async () =>
  run(async (call) => {
    assert.equal(
      (await call('/oauth/register', post({ redirect_uris: [redirect] })))
        .status,
      503,
    );
  }, null));
test('registered clients and codes work across fresh handler instances', async () => {
  const shared = store();
  let client, authorizationCode;
  await run(async (call) => {
    client = await register(call);
    authorizationCode = await code(call, client);
  }, shared);
  await run(async (call) => {
    const response = await call(
      '/oauth/token',
      post({
        grant_type: 'authorization_code',
        code: authorizationCode,
        client_id: client,
        redirect_uri: redirect,
        code_verifier: verifier,
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(
      (
        await call(
          '/oauth/token',
          post({
            grant_type: 'authorization_code',
            code: authorizationCode,
            client_id: client,
            redirect_uri: redirect,
            code_verifier: verifier,
          }),
        )
      ).status,
      400,
    );
  }, shared);
});
test('consent belongs to the originating session and expires before approval', async () => {
  const shared = store();
  await run(async (call) => {
    const client = await register(call);
    const token = await consent(call, client);
    const other = await issueBrowserSession({email:'other@example.com',google_id:'other'},{oauthStore:shared,sessionSecret:secret,publicBaseUrl:'',resourceContext:{resourceUrl:()=>'/mcp'}},null);
    assert.equal(
      (
        await call('/oauth/authorize', {
          ...post({ consent_token: token, decision: 'allow' }),
          headers: {
            'content-type': 'application/json',
            cookie: 'swmcp_session=' + other,
          },
        })
      ).status,
      400,
    );
    const get = shared.get.bind(shared);
    shared.get = async (kind, key) => {
      const row = await get(kind, key);
      return kind === 'consent' && row ? { ...row, expires_at: 0 } : row;
    };
    assert.equal(
      (
        await call(
          '/oauth/authorize',
          post({ consent_token: token, decision: 'allow' }),
        )
      ).status,
      400,
    );
  }, shared);
});
test('code expiry and unsafe client registration are rejected', async () => {
  const shared = store();
  await run(async (call) => {
    for (const uri of [
      'javascript:alert(1)',
      'https://client.example/cb#fragment',
      'http://public.example/cb',
      'https://user:pass@client.example/cb',
    ]) {
      assert.equal(
        (await call('/oauth/register', post({ redirect_uris: [uri] }))).status,
        400,
      );
    }
    const client = await register(call),
      c = await code(call, client);
    const get = shared.get.bind(shared);
    shared.get = async (kind, key) => {
      const row = await get(kind, key);
      return kind === 'code' && row ? { ...row, expires_at: 0 } : row;
    };
    assert.equal(
      (
        await call(
          '/oauth/token',
          post({
            grant_type: 'authorization_code',
            code: c,
            client_id: client,
            redirect_uri: redirect,
            code_verifier: verifier,
          }),
        )
      ).status,
      400,
    );
  }, shared);
});

test('HTTP access stays distinct from browser cookies; rotation replay and revocation invalidate events and tools', async () => run(async call => {
  const client = await register(call);
  const exchange = async () => (await call('/oauth/token', post({grant_type:'authorization_code', code:await code(call,client), client_id:client, redirect_uri:redirect, code_verifier:verifier}))).json();
  const invoke = (token, method='events/list') => call('/mcp', {method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({jsonrpc:'2.0',id:1,method})});
  assert.equal((await invoke(session)).status,401);
  const first = await exchange();
  assert.equal((await invoke(first.access_token)).status,200);
  const rotate = token => call('/oauth/token',post({grant_type:'refresh_token',refresh_token:token,client_id:client}));
  const rotated = await (await rotate(first.refresh_token)).json();
  assert.ok(rotated.refresh_token);
  assert.notEqual(rotated.refresh_token,first.refresh_token);
  assert.equal((await rotate(first.refresh_token)).status,400);
  assert.equal((await invoke(rotated.access_token)).status,401);
  const second = await exchange();
  assert.equal((await call('/oauth/revoke',post({token:second.refresh_token,client_id:client}))).status,200);
  assert.equal((await invoke(second.access_token,'tools/list')).status,401);
  assert.equal((await call('/oauth/revoke',post({token:'unknown',client_id:client}))).status,200);
}));

test('logout durably revokes browser session and all linked access and refresh credentials',async()=>run(async call=>{
  const client=await register(call), c=await code(call,client);
  const pair=await (await call('/oauth/token',post({grant_type:'authorization_code',code:c,client_id:client,redirect_uri:redirect,code_verifier:verifier}))).json();
  assert.equal((await call('/auth/success',{headers:{cookie:'swmcp_session='+session}})).status,200);
  const logout=await call('/auth/logout',post({}));
  assert.equal(logout.status,200); assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await call('/auth/success',{headers:{cookie:'swmcp_session='+session}})).status,302);
  assert.equal((await call('/oauth/token',post({grant_type:'refresh_token',refresh_token:pair.refresh_token,client_id:client}))).status,400);
  assert.equal((await call('/mcp',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+pair.access_token},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'events/list'})})).status,401);
}));

test('revocation is a silent no-op outside the exact authorized resource binding',async()=>{
  const shared=store(), publicBaseUrl='https://mcp.example';
  const resourceContext={parse:url=>url.searchParams.get('domain'),equals:(a,b)=>a===b,resourceUrl:(base,domain)=>base+'/mcp?domain='+encodeURIComponent(domain),appendToUrl:(path,domain)=>path+'?domain='+encodeURIComponent(domain)};
  const context={oauthStore:shared,sessionSecret:secret,publicBaseUrl,resourceContext};
  await run(async call=>{
    const client=await register(call);
    const invoke=token=>call('/mcp?domain=shop-a.example',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'events/list'})});
    for(const kind of ['access_token','refresh_token']) {
      const pair=await issueTokenFamily({email:'owner@example.com'}, {client_id:client,...credentialBinding(context,'shop-a.example')},context);
      const mismatch=await call('/oauth/revoke?domain=shop-b.example',post({token:pair[kind],client_id:client}));
      assert.equal(mismatch.status,200);
      assert.deepEqual(await mismatch.json(),{});
      assert.equal((await invoke(pair.access_token)).status,200);
      const revoked=await call('/oauth/revoke?domain=shop-a.example',post({token:pair[kind],client_id:client}));
      assert.equal(revoked.status,200);
      assert.deepEqual(await revoked.json(),{});
      assert.equal((await invoke(pair.access_token)).status,401);
    }
    const unknown=await call('/oauth/revoke?domain=shop-b.example',post({token:'unknown',client_id:client}));
    assert.equal(unknown.status,200);
    assert.deepEqual(await unknown.json(),{});
  },shared,{publicBaseUrl,resourceContext});
});
