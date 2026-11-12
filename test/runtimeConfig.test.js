import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRuntimeConfig } from '../src/runtimeConfig.js';
import { createRequestHandler } from '../src/app.js';
test('production fails closed without canonical URL and explicit Google audience', () => {
  for (const options of [
    {},
    { publicBaseUrl: 'https://mcp.example.com' },
    { publicBaseUrl: 'http://mcp.example.com', googleClientId: 'client' },
    { publicBaseUrl: 'https://u:p@mcp.example.com', googleClientId: 'client' },
    { publicBaseUrl: 'https://mcp.example.com/path', googleClientId: 'client' },
    { publicBaseUrl: 'https://mcp.example.com?x=1', googleClientId: 'client' },
  ]) {
    assert.throws(() => resolveRuntimeConfig(options, {}));
  }
});
test('production cookies stay secure and explicit local test mode is required', () => {
  const config = resolveRuntimeConfig(
    { publicBaseUrl: 'https://mcp.example.com/', googleClientId: 'client' },
    {},
  );
  assert.equal(config.publicBaseUrl, 'https://mcp.example.com');
  assert.equal(config.secureCookies, true);
  assert.throws(() =>
    resolveRuntimeConfig({ ...config, secureCookies: false }, {}),
  );
  assert.equal(
    resolveRuntimeConfig({ runtimeMode: 'test', secureCookies: false }, {})
      .secureCookies,
    false,
  );
});

test('handler enforces production configuration and standalone domain adapter', () => {
  const base = {
    accountRepository: {},
    sessionSecret: 'test-secret',
    runtimeMode: 'production',
  };
  assert.throws(() => createRequestHandler(base), /Production MCP requires/);
  assert.throws(
    () =>
      createRequestHandler({
        ...base,
        publicBaseUrl: 'https://mcp.example.com',
        googleClientId: 'client',
        requireResourceContext: true,
      }),
    /resource context|resourceContext|Resource context/i,
  );
});

test('approval Google audience resolves independently from ordinary login configuration', () => {
  const config = resolveRuntimeConfig(
    {},
    {
      NODE_ENV: 'test',
      GOOGLE_CLIENT_ID: 'ordinary-google-client',
      HUMAN_APPROVAL_GOOGLE_CLIENT_ID: ' approval-only-client ',
    },
  );
  assert.equal(config.googleClientId, 'ordinary-google-client');
  assert.equal(config.humanApprovalGoogleClientId, 'approval-only-client');
  assert.equal(
    resolveRuntimeConfig(
      { runtimeMode: 'test' },
      { GOOGLE_CLIENT_ID: 'ordinary' },
    ).humanApprovalGoogleClientId,
    '',
  );
});

test('production approval transport requires its dedicated Google audience at startup', () => {
  const options = {
    accountRepository: {},
    runtimeMode: 'production',
    googleClientId: 'ordinary-google-client',
    publicBaseUrl: 'https://approval.example',
    humanApprovalTransport: {},
    humanApprovalGoogleClientId: '',
  };
  assert.throws(
    () => createRequestHandler(options),
    /HUMAN_APPROVAL_GOOGLE_CLIENT_ID/,
  );
  assert.throws(
    () =>
      createRequestHandler({
        ...options,
        humanApprovalGoogleClientId: options.googleClientId,
      }),
    /distinct|different|separate/i,
  );
  assert.doesNotThrow(() =>
    createRequestHandler({
      ...options,
      humanApprovalGoogleClientId: 'approval-only-client',
    }),
  );
  assert.doesNotThrow(() =>
    createRequestHandler({ ...options, humanApprovalTransport: null }),
  );
});
