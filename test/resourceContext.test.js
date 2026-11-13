import {testStore,testServiceResolver} from './fixtures.js';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import { createRequestHandler } from '../src/app.js';
import { verifySignedToken } from '../src/session.js';
import {createTestServiceToken} from './fixtures.js';

function domainProvider(onValidate = async (value) => value) {
  return {
    parse(url) {
      return url.searchParams.get('domain');
    },
    validateAfterIdentity: onValidate,
    equals(left, right) {
      return left === right;
    },
    appendToUrl(pathname, value) {
      if (!value) return pathname;
      const url = new URL(pathname, 'https://local.invalid');
      url.searchParams.set('domain', value);
      return `${url.pathname}${url.search}${url.hash}`;
    },
    resourceUrl(baseUrl, value) {
      return `${baseUrl.replace(/\/+$/, '')}/mcp?domain=${encodeURIComponent(value)}`;
    }
  };
}

async function withServer(options, run) {
  const server = createServer(createRequestHandler({oauthStore:testStore(),verifiedServiceIdentityResolver:testServiceResolver('test-secret'),...options}));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

const repository = {
  async listSitesForAdminIdentity() { return []; },
  async listAdminSitesForGoogleProfile(profile) {
    return [{ site_id: 1, site_code: 'swcb_test', name: 'Test', permissions: ['system_admin'] }];
  }
};

test('explicit test service adapter preserves resource context claims', () => {
  const token = createTestServiceToken(
    { email: 'owner@example.com', name: 'Owner', google_id: 'owner-sub' },
    'test-secret',
    1_700_000_000_000,
    { resource_context: 'shop.example.com' }
  );
  const session = verifySignedToken(token, 'test-secret');

  assert.equal(session.resource_context, 'shop.example.com');
});

test('resource context is preserved in login and protected-resource metadata', async () => {
  await withServer({
    accountRepository: repository,
    sessionSecret: 'test-secret',
    publicBaseUrl: 'https://standalone-mcp.example.com',
    resourceContext: domainProvider()
  }, async (baseUrl) => {
    const login = await fetch(`${baseUrl}/auth/login?domain=shop.example.com`);
    const html = await login.text();
    assert.match(html, /\/auth\/google\?domain=shop\.example\.com/);

    const metadata = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp?domain=shop.example.com`);
    assert.equal(
      (await metadata.json()).resource,
      'https://standalone-mcp.example.com/mcp?domain=shop.example.com'
    );
  });
});

test('Google login validates resource context before signing the session', async () => {
  let validated = null;
  await withServer({
    accountRepository: repository,
    sessionSecret: 'test-secret',
    secureCookies: false,
    googleVerifier: { async verify() { return { sub: 'owner-sub', email: 'owner@example.com', name: 'Owner' }; } },
    resourceContext: domainProvider(async (value, identity) => {
      validated = { value, identity };
      return value;
    })
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/google?domain=shop.example.com`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: 'test' })
    });
    const payload = await response.json();
    const session = verifySignedToken(decodeURIComponent(response.headers.get('set-cookie').split(';')[0].split('=')[1]), 'test-secret');

    assert.equal(response.status, 200);
    assert.equal(validated.value, 'shop.example.com');
    assert.equal(validated.identity.sub, 'owner-sub');
    assert.equal(session.typ, 'browser_session');
    assert.deepEqual(payload.session, {authenticated:true});
  });
});

test('authenticated MCP rejects cross-context bearer reuse', async () => {
  const token = createTestServiceToken(
    { email: 'owner@example.com', name: 'Owner', google_id: 'owner-sub' },
    'test-secret',
    Date.now(),
    { resource_context: 'first.example.com' }
  );

  await withServer({
    accountRepository: repository,
    sessionSecret: 'test-secret',
    resourceContext: domainProvider()
  }, async (baseUrl) => {
    for (const [method, params] of [['tools/list', {}], ['tools/call', { name: 'slimweb_guides_get', arguments: { topic: 'index' } }], ['resources/read', { uri: 'slimweb://guides/overview' }]]) {
    const response = await fetch(`${baseUrl}/mcp?domain=second.example.com`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 7, method, params })
    });
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error.data.reason, 'DOMAIN_SESSION_MISMATCH');
    }
  });
});

// Execute the actual generated GIS callback, including its async fetch chain.
async function runLoginCallback(html, loginResult = {ok: true}) {
  const requests = [];
  const alerts = [];
  const window = {location: {href: null}};
  let callback;
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
  assert.ok(script, 'login page contains its inline callback');
  runInNewContext(script, {
    window,
    document: {getElementById() { return {}; }},
    google: {accounts: {id: {
      initialize(options) { callback = options.callback; },
      renderButton() {}
    }}},
    fetch: async (path, options) => { requests.push({path, options}); return loginResult; },
    alert: message => alerts.push(message)
  });
  window.onload();
  callback({credential: 'verified-google-credential'});
  await new Promise(resolve => setImmediate(resolve));
  return {requests, alerts, redirect: window.location.href};
}

test('generated Google callback keeps the current domain on every local post-login redirect', async () => {
  await withServer({
    accountRepository: repository,
    sessionSecret: 'test-secret',
    resourceContext: domainProvider()
  }, async baseUrl => {
    const cases = [
      [null, '/auth/success?domain=shop.example.com'],
      ['/oauth/authorize?client_id=client#consent', '/oauth/authorize?client_id=client&domain=shop.example.com#consent'],
      ['/oauth/authorize?client_id=client&state=state&domain=other.example.com',
        '/oauth/authorize?client_id=client&state=state&domain=shop.example.com'],
      ['https://evil.example/auth/success?domain=other.example.com&state=ok',
        '/auth/success?domain=shop.example.com&state=ok'],
      ['//evil.example/auth/success', '/auth/success?domain=shop.example.com'],
      ['not a valid URL', '/auth/success?domain=shop.example.com']
    ];
    for (const [next, expected] of cases) {
      const loginUrl = new URL('/auth/login?domain=shop.example.com', baseUrl);
      if (next !== null) loginUrl.searchParams.set('next', next);
      const response = await fetch(loginUrl);
      assert.equal(response.status, 200);
      const result = await runLoginCallback(await response.text());
      assert.deepEqual(result.alerts, []);
      assert.equal(result.requests.length, 1);
      assert.equal(result.requests[0].path, '/auth/google?domain=shop.example.com');
      assert.equal(result.requests[0].options.method, 'POST');
      assert.equal(JSON.parse(result.requests[0].options.body).credential, 'verified-google-credential');
      assert.equal(result.redirect, expected, `next=${next}`);
      assert.equal(new URL(result.redirect, baseUrl).origin, new URL(baseUrl).origin);
    }
  });
});

test('generated Google callback preserves SaaS next query without adding a domain', async () => {
  await withServer({accountRepository: repository, sessionSecret: 'test-secret'}, async baseUrl => {
    const response = await fetch(baseUrl + '/auth/login?next=' + encodeURIComponent('/oauth/authorize?client_id=client&state=state#consent'));
    const result = await runLoginCallback(await response.text());
    assert.equal(result.requests[0].path, '/auth/google');
    assert.equal(result.redirect, '/oauth/authorize?client_id=client&state=state#consent');
  });
});

test('generated Google callback does not redirect after rejected login', async () => {
  await withServer({accountRepository: repository, sessionSecret: 'test-secret', resourceContext: domainProvider()}, async baseUrl => {
    const response = await fetch(baseUrl + '/auth/login?domain=shop.example.com');
    const result = await runLoginCallback(await response.text(), {
      ok: false, async json() { return {error: {message: 'Permission denied'}}; }
    });
    assert.equal(result.redirect, null);
    assert.equal(result.alerts.length, 1);
    assert.match(result.alerts[0], /Permission denied/);
  });
});

test('generated SaaS callback rejects normalized protocol-relative next paths', async () => {
  await withServer({accountRepository: repository, sessionSecret: 'test-secret'}, async baseUrl => {
    for (const next of [
      'https://evil.example//other.example/path',
      'https://evil.example/\\/other.example/path',
      '/safe/..//other.example/path'
    ]) {
      const response = await fetch(baseUrl + '/auth/login?next=' + encodeURIComponent(next));
      const result = await runLoginCallback(await response.text());
      assert.equal(result.redirect, '/auth/success', `next=${next}`);
      assert.equal(new URL(result.redirect, baseUrl).origin, new URL(baseUrl).origin);
    }
  });
});
