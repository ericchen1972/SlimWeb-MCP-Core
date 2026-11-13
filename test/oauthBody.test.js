import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Readable} from 'node:stream';
import {readOAuthBody} from '../src/oauth.js';

test('OAuth resource form is bounded and reused after context parsing', async () => {
  const resource = 'https://mcp.example/mcp?domain=shop.example';
  const request = Readable.from([new URLSearchParams({resource, grant_type: 'refresh_token'}).toString()]);
  request.headers = {'content-type': 'application/x-www-form-urlencoded'};
  const first = await readOAuthBody(request);
  assert.equal(first.resource, resource);
  assert.equal(await readOAuthBody(request), first);
  const oversized = Readable.from(['a'.repeat(16385)]);
  oversized.headers = {};
  await assert.rejects(readOAuthBody(oversized), /Request too large/);
});

test('OAuth JSON body rejects non-object payloads', async () => {
  for (const value of ['null', '[]', '"string"']) {
    const request = Readable.from([value]);
    request.headers = {'content-type': 'application/json'};
    await assert.rejects(readOAuthBody(request), /Invalid OAuth request body/);
  }
});
