import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { GoogleIdentityVerifier } from '../src/googleVerifier.js';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const now = 1800000000;
function token(claims = {}, header = {}) {
  const a = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key', ...header })).toString('base64url');
  const b = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'configured-client', sub: '123', email: 'owner@example.com', email_verified: true, iat: now - 10, exp: now + 1000, ...claims })).toString('base64url');
  return a + '.' + b + '.' + sign('RSA-SHA256', Buffer.from(a + '.' + b), privateKey).toString('base64url');
}
function verifier() {
  let calls = 0;
  return { get calls() { return calls; }, value: new GoogleIdentityVerifier({ clientId: 'configured-client', now: () => now, fetchImpl: async (url, options) => {
    calls++; assert.equal(String(url), 'https://www.googleapis.com/oauth2/v3/certs');
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'public,max-age=3600' } });
  } }) };
}
test('locally verifies signed Google credential and caches public keys without transmitting token', async () => {
  const v = verifier();
  assert.equal((await v.value.verify(token())).sub, '123');
  await v.value.verify(token()); assert.equal(v.calls, 1);
});
test('rejects invalid signature and Google security claims', async () => {
  for (const claims of [{ aud: 'other' }, { iss: 'evil' }, { exp: now }, { iat: now + 300 }, { email_verified: false }, { email_verified: 'true' }, { sub: '' }, { email: '' }]) {
    await assert.rejects(verifier().value.verify(token(claims)));
  }
  const valid = token();
  await assert.rejects(verifier().value.verify(valid.slice(0, -10) + 'aaaaaaaaaa'));
  await assert.rejects(verifier().value.verify(token({}, { alg: 'HS256' })));
});
test('requires explicit audience and never falls back to SaaS client', async () => {
  await assert.rejects(new GoogleIdentityVerifier({ clientId: '' }).verify(token()));
});

test('fails closed for missing key, expired cache, fetch failure, and oversized JWKS', async () => {
  const v = verifier();
  for (let i = 0; i < 5; i++) await assert.rejects(v.value.verify(token({}, { kid: 'unknown' })));
  assert.equal(v.calls, 1);
  const unavailable = new GoogleIdentityVerifier({ clientId: 'configured-client', now: () => now, fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(unavailable.verify(token()));
  const oversized = new GoogleIdentityVerifier({ clientId: 'configured-client', now: () => now, fetchImpl: async () => new Response('x'.repeat(70000)) });
  await assert.rejects(oversized.verify(token()));
});
