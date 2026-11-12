import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRuntimeConfig } from '../src/runtimeConfig.js';
import { createRequestHandler } from '../src/app.js';
test('production fails closed without canonical URL and explicit Google audience', () => {
  for (const options of [{}, { publicBaseUrl: 'https://mcp.example.com' }, { publicBaseUrl: 'http://mcp.example.com', googleClientId: 'client' }, { publicBaseUrl: 'https://u:p@mcp.example.com', googleClientId: 'client' }, { publicBaseUrl: 'https://mcp.example.com/path', googleClientId: 'client' }, { publicBaseUrl: 'https://mcp.example.com?x=1', googleClientId: 'client' }]) {
    assert.throws(() => resolveRuntimeConfig(options, {}));
  }
});
test('production cookies stay secure and explicit local test mode is required', () => {
  const config = resolveRuntimeConfig({ publicBaseUrl: 'https://mcp.example.com/', googleClientId: 'client' }, {});
  assert.equal(config.publicBaseUrl, 'https://mcp.example.com'); assert.equal(config.secureCookies, true);
  assert.throws(() => resolveRuntimeConfig({ ...config, secureCookies: false }, {}));
  assert.equal(resolveRuntimeConfig({ runtimeMode: 'test', secureCookies: false }, {}).secureCookies, false);
});

test('handler enforces production configuration and standalone domain adapter', () => {
  const base = { accountRepository: {}, sessionSecret: 'test-secret', runtimeMode: 'production' };
  assert.throws(() => createRequestHandler(base), /Production MCP requires/);
  assert.throws(() => createRequestHandler({ ...base, publicBaseUrl: 'https://mcp.example.com', googleClientId: 'client', requireResourceContext: true }), /resource context|resourceContext|Resource context/i);
});
