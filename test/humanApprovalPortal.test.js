import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequestHandler } from '../src/app.js';
import { runInNewContext } from 'node:vm';

const id = '99f36964-e577-4e36-a64e-a362c0b2b2f3';
const other = 'db551f88-e577-4e36-a64e-a362c0b2b2f3';
const origin = 'https://approval.example';
const path = `/human-approvals/${id}?site_code=shop1`;

test('the browser Google nonce challenge expires within two minutes', async () =>
  fixture(async ({ request }) => {
    const page = await request();
    const encoded = cookie(page).split('=')[1].split('.')[0];
    const challenge = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    );
    assert.ok(challenge.expires_at <= Math.floor(Date.now() / 1000) + 120);
    assert.match(page.headers.get('set-cookie'), /Max-Age=120;/);
  }));
async function fixture(run, options = {}, recordOverrides = {}) {
  const calls = [];
  const transport = {
    async bootstrap(input) {
      calls.push(['bootstrap', input]);
      return {
        human_ticket: 't'.repeat(43),
        expires_at: Math.floor(Date.now() / 1000) + 300,
      };
    },
    async preview(input) {
      calls.push(['preview', input]);
      return {
        site: { name: 'Merchant & Shop', site_code: 'shop1' },
        record: {
          id,
          operation: 'slimweb_orders_delete',
          status: 'pending',
          expires_at: Math.floor(Date.now() / 1000) + 300,
          payload: { order_ids: [42] },
          preview: { count: 1 },
          ...recordOverrides,
        },
      };
    },
    async decide(input) {
      calls.push(['decide', input]);
      return { status: input.decision === 'approve' ? 'approved' : 'rejected' };
    },
  };
  const server = createServer(
    createRequestHandler({
      accountRepository: {},
      sessionSecret: 'human-portal-test-secret-32-bytes',
      publicBaseUrl: origin,
      googleClientId: 'google-client',
      humanApprovalGoogleClientId: 'approval-only-google-client',
      humanApprovalTransport: transport,
      ...options,
    }),
  );
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const request = (p = path, init = {}) =>
    fetch(`http://127.0.0.1:${server.address().port}${p}`, {
      redirect: 'manual',
      ...init,
    });
  try {
    await run({ request, calls });
  } finally {
    await new Promise((r) => server.close(r));
  }
}
test('ordinary Google client ID alone never enables the approval portal', async () =>
  fixture(
    async ({ request, calls }) => {
      const response = await request();
      assert.equal(response.status, 503);
      assert.equal(calls.length, 0);
      assert.equal(response.headers.get('set-cookie'), null);
    },
    { humanApprovalGoogleClientId: '' },
  ));

test('newsletter approval explains dynamic delivery-time audience in Chinese and English', async () => {
  for (const language of ['zh-TW', 'en']) {
    for (const operation of [
      'slimweb_newsletters_create',
      'slimweb_newsletters_update',
    ]) {
      await fixture(
        async ({ request, calls }) => {
          const session = await login(request);
          const response = await request(path, {
            headers: { cookie: session, 'accept-language': language },
          });
          assert.equal(response.status, 200);
          const html = await response.text();
          assert.match(
            html,
            language.startsWith('zh')
              ? /寄送當下所有有效會員/
              : /all active members at delivery time/,
          );
          assert.match(
            html,
            language.startsWith('zh')
              ? /人數僅供參考/
              : /count is informational/,
          );
          assert.match(
            html,
            language.startsWith('zh') ? /電子報/ : /newsletter/,
          );
          assert.match(html, /all_active_members_at_delivery/);
          assert.match(html, /&lt;newsletter&gt;/);
          assert.equal(calls.filter((call) => call[0] === 'decide').length, 0);
        },
        {},
        {
          operation,
          payload: { title: '<newsletter>' },
          preview: {
            audience: 'all_active_members_at_delivery',
            current_recipient_count: 42,
          },
        },
      );
    }
  }
});

test('LINE approval distinguishes all friends from the frozen member list in both languages', async () => {
  for (const language of ['zh-TW', 'en']) {
    for (const audience of ['all', 'members']) {
      await fixture(
        async ({ request }) => {
          const session = await login(request);
          const response = await request(path, {
            headers: { cookie: session, 'accept-language': language },
          });
          assert.equal(response.status, 200);
          const html = await response.text();
          const expected = language.startsWith('zh')
            ? audience === 'all'
              ? /LINE 所有好友/
              : /準備時固定的會員收件名單/
            : audience === 'all'
              ? /all LINE friends/
              : /member recipient list frozen at preparation/;
          assert.match(html, expected);
          assert.match(
            html,
            language.startsWith('zh')
              ? /發送 LINE 群發訊息/
              : /Send LINE push messages/,
          );
          assert.match(html, /slimweb_line_push_send/);
          assert.doesNotMatch(
            html,
            /寄送當下所有有效會員|all active members at delivery time/,
          );
        },
        {},
        {
          operation: 'slimweb_line_push_send',
          preview: { audience, recipient_count: 42 },
        },
      );
    }
  }
});
function cookie(response) {
  return response.headers
    .getSetCookie()
    .map((x) => x.split(';')[0])
    .join('; ');
}
function hidden(html, name) {
  return html.match(new RegExp(`name="${name}" value="([^"]+)"`))?.[1];
}
async function login(request, reviewPath = path) {
  const page = await request(reviewPath);
  assert.equal(page.status, 200);
  const html = await page.text();
  const response = await request(reviewPath + '&action=login', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      cookie: cookie(page),
    },
    body: JSON.stringify({
      credential: 'fresh-google-proof',
      nonce: hidden(html, 'google_nonce'),
      csrf: hidden(html, 'csrf'),
    }),
  });
  assert.equal(response.status, 303);
  return cookie(response);
}
test('portal requires independent login even with API credentials; login has no automatic selection', async () =>
  fixture(async ({ request, calls }) => {
    const page = await request(path, {
      headers: {
        authorization: 'Bearer ordinary-api-token',
        cookie: 'swmcp_session=ordinary-browser-session',
        'accept-language': 'zh-TW',
      },
    });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /重新登入/);
    assert.match(html, /auto_select:false/);
    assert.match(html, /renderButton/);
    assert.doesNotMatch(html, /prompt\(/);
    assert.match(
      page.headers.get('content-security-policy'),
      /frame-ancestors 'none'/,
    );
    assert.match(page.headers.get('set-cookie'), /HttpOnly/);
    assert.match(page.headers.get('set-cookie'), /Secure/);
    assert.equal(calls.length, 0);
  }));
test('only fresh challenge-bound same-origin login sets an approval-only cookie', async () =>
  fixture(async ({ request, calls }) => {
    const page = await request();
    const html = await page.text();
    const input = {
      credential: 'proof',
      nonce: hidden(html, 'google_nonce'),
      csrf: hidden(html, 'csrf'),
    };
    for (const headers of [{ origin: 'https://merchant.example' }, {}]) {
      const r = await request(path + '&action=login', {
        method: 'POST',
        headers: {
          ...headers,
          cookie: cookie(page),
          'content-type': 'application/json',
        },
        body: JSON.stringify(input),
      });
      assert.equal(r.status, 403);
    }
    const wrong = await request(path + '&action=login', {
      method: 'POST',
      headers: {
        origin,
        cookie: cookie(page),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...input, nonce: 'wrong' }),
    });
    assert.equal(wrong.status, 403);
    assert.equal(calls.length, 0);
    const r = await request(path + '&action=login', {
      method: 'POST',
      headers: {
        origin,
        cookie: cookie(page),
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), path);
    assert.match(cookie(r), /__Host-swmcp_approval=/);
    assert.doesNotMatch(cookie(r), /swmcp_session=/);
    assert.doesNotMatch(await r.text(), /tttttttt/);
    assert.equal(calls[0][1].nonce, input.nonce);
    assert.equal(calls[0][1].approval_id, id);
  }));
test('approval previews are escaped text and decisions require independent cookie plus CSRF', async () =>
  fixture(async ({ request, calls }) => {
    const session = await login(request);
    const page = await request(path, { headers: { cookie: session } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Merchant &amp; Shop/);
    assert.match(html, /slimweb_orders_delete/);
    assert.match(html, /42/);
    const csrf = hidden(html, 'csrf');
    for (const h of [
      { origin, cookie: 'swmcp_session=ordinary' },
      { origin: 'https://merchant.example', cookie: session },
    ]) {
      const r = await request(path + '&action=decide', {
        method: 'POST',
        headers: { ...h, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ decision: 'approve', csrf }),
      });
      assert.equal(r.status, 403);
    }
    const r = await request(path + '&action=decide', {
      method: 'POST',
      headers: {
        origin,
        cookie: session,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ decision: 'approve', csrf }),
    });
    assert.equal(r.status, 303);
    assert.deepEqual(calls.at(-1), [
      'decide',
      {
        human_ticket: 't'.repeat(43),
        approval_id: id,
        site_code: 'shop1',
        domain: null,
        decision: 'approve',
      },
    ]);
  }));
test('cookie is bound to exact approval and site; GET never decides', async () =>
  fixture(async ({ request, calls }) => {
    const session = await login(request);
    const switched = await request(
      `/human-approvals/${other}?site_code=shop1`,
      { headers: { cookie: session } },
    );
    assert.equal(switched.status, 200);
    assert.match(await switched.text(), /Sign in again/);
    const changed = await request(
      path.replace('shop1', 'shop2') + '&action=decide',
      {
        method: 'POST',
        headers: {
          origin,
          cookie: session,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'decision=approve&csrf=bad',
      },
    );
    assert.equal(changed.status, 403);
    await request(path + '&action=decide', { headers: { cookie: session } });
    assert.equal(calls.filter((c) => c[0] === 'decide').length, 0);
  }));
test('missing transport fails closed and malformed routes do not reach backend', async () =>
  fixture(
    async ({ request, calls }) => {
      assert.equal((await request(path)).status, 503);
      assert.equal(calls.length, 0);
    },
    { humanApprovalTransport: null },
  ));
test('nonce-authorized script loads Google and renders only a button until the human signs in', async () =>
  fixture(async ({ request, calls }) => {
    const page = await request();
    const html = await page.text();
    const script = html.match(/<script nonce="([^"]+)">([\s\S]+?)<\/script>/);
    assert.ok(script);
    assert.match(
      page.headers.get('content-security-policy'),
      new RegExp(`nonce-${script[1]}`),
    );
    assert.doesNotMatch(html, /onload="/);
    let external,
      config,
      buttons = 0,
      fetches = 0;
    const document = {
      head: {
        append(s) {
          external = s;
        },
      },
      createElement() {
        return {};
      },
      getElementById() {
        return {};
      },
    };
    const window = {};
    const google = {
      accounts: {
        id: {
          initialize(input) {
            config = input;
          },
          renderButton() {
            buttons++;
          },
        },
      },
    };
    runInNewContext(script[2], {
      window,
      document,
      google,
      fetch() {
        fetches++;
      },
      location: {
        assign() {
          throw Error('No automatic redirect');
        },
      },
    });
    assert.equal(external.src, 'https://accounts.google.com/gsi/client');
    assert.equal(external.nonce, script[1]);
    assert.equal(buttons, 0);
    external.onload();
    assert.equal(buttons, 1);
    assert.equal(config.auto_select, false);
    assert.equal(config.client_id, 'approval-only-google-client');
    assert.equal(config.nonce, hidden(html, 'google_nonce'));
    assert.equal(fetches, 0);
    assert.equal(calls.length, 0);
  }));
test('a changed session cookie and a mismatched decision csrf cannot grant approval', async () =>
  fixture(async ({ request, calls }) => {
    const session = await login(request);
    const page = await request(path, { headers: { cookie: session } });
    const html = await page.text();
    const response = await request(path + '&action=decide', {
      method: 'POST',
      headers: {
        origin,
        cookie: session,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'decision=approve&csrf=incorrect',
    });
    assert.equal(response.status, 403);
    const bad = session.replace(
      /(__Host-swmcp_approval=)[^;]+/,
      (match, prefix) =>
        prefix +
        match.slice(prefix.length, -1) +
        (match.endsWith('a') ? 'b' : 'a'),
    );
    const denied = await request(path + '&action=decide', {
      method: 'POST',
      headers: {
        origin,
        cookie: bad,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        decision: 'approve',
        csrf: hidden(html, 'csrf'),
      }),
    });
    assert.equal(denied.status, 403);
    assert.equal(calls.filter((c) => c[0] === 'decide').length, 0);
  }));
test('fresh login recovery remains available when an approval cookie already exists', async () =>
  fixture(async ({ request, calls }) => {
    const session = await login(request);
    const response = await request(path + '&action=signin', {
      headers: { cookie: session },
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Sign in again/);
    assert.equal(calls.filter((c) => c[0] === 'preview').length, 0);
    const preview = await request(path, { headers: { cookie: session } });
    assert.match(await preview.text(), /action=signin/);
  }));
test('the preview prominently identifies the exact standalone merchant domain', async () =>
  fixture(
    async ({ request }) => {
      const domainPath = path + '&domain=merchant.example';
      const session = await login(request, domainPath);
      const response = await request(domainPath, {
        headers: { cookie: session },
      });
      assert.match(
        await response.text(),
        /<strong>merchant\.example<\/strong>/,
      );
    },
    {
      resourceContext: {
        parse: (url) => url.searchParams.get('domain'),
        equals: (a, b) => a === b,
      },
    },
  ));
