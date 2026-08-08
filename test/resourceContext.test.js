import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { createRequestHandler } from '../src/app.js';
import { createSessionToken, verifySessionToken } from '../src/session.js';

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
      return `${url.pathname}${url.search}`;
    },
    resourceUrl(baseUrl, value) {
      return `${baseUrl.replace(/\/+$/, '')}/mcp?domain=${encodeURIComponent(value)}`;
    }
  };
}

async function withServer(options, run) {
  const server = createServer(createRequestHandler(options));
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

test('session tokens preserve signed resource context claims', () => {
  const token = createSessionToken(
    { email: 'owner@example.com', name: 'Owner', google_id: 'owner-sub' },
    'test-secret',
    1_700_000_000_000,
    { resource_context: 'shop.example.com' }
  );
  const session = verifySessionToken(token, 'test-secret', 1_700_000_001_000);

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
    const session = verifySessionToken(payload.session.access_token, 'test-secret');

    assert.equal(response.status, 200);
    assert.equal(validated.value, 'shop.example.com');
    assert.equal(validated.identity.sub, 'owner-sub');
    assert.equal(session.resource_context, 'shop.example.com');
  });
});

test('authenticated MCP rejects cross-context bearer reuse', async () => {
  const token = createSessionToken(
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
    const response = await fetch(`${baseUrl}/mcp?domain=second.example.com`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' })
    });
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error.data.reason, 'DOMAIN_SESSION_MISMATCH');
  });
});
