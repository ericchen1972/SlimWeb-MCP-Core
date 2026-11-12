import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createRequestHandler } from '../src/app.js';
import {
  createSessionToken,
  createSignedToken,
  verifySessionToken,
} from '../src/session.js';
const secret = 'oauth-security-test';
const session = createSessionToken(
  { email: 'owner@example.com', google_id: 'owner' },
  secret,
);
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
async function run(fn, shared = store()) {
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
test('authorization code cannot be a session and session type cannot be overridden', () => {
  assert.equal(
    verifySessionToken(
      createSignedToken(
        { typ: 'oauth_code', email: 'owner', exp: Date.now() / 1000 + 100 },
        secret,
      ),
      secret,
    ),
    null,
  );
  assert.equal(
    verifySessionToken(
      createSessionToken({ email: 'owner' }, secret, Date.now(), {
        typ: 'oauth_code',
      }),
      secret,
    )?.typ,
    'session',
  );
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
    assert.equal(verifySessionToken(good.access_token, secret)?.typ, 'session');
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
+test('registered clients and codes work across fresh handler instances', async () => {
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
    const other = createSessionToken(
      { email: 'other@example.com', google_id: 'other' },
      secret,
    );
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
