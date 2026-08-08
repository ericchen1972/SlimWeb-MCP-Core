import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRequestHandler } from '../src/app.js';

test('requires an injected account repository', () => {
  assert.throws(
    () => createRequestHandler({ sessionSecret: 'test-session-secret' }),
    /accountRepository is required\./
  );
});
