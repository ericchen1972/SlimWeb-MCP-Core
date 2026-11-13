import { createHash, randomBytes } from 'node:crypto';
import {
  credentialBinding, issueTokenFamily, readBrowserToken, verifyDurableToken,
  rotateRefreshToken, revokeCredential,
} from './session.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const json = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
};
const fail = (res, status, error, description) =>
  json(res, status, { error, error_description: description });
const redirect = (res, url) => {
  res.writeHead(302, {
    location: url,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  res.end();
};
const parsedBodies = new WeakMap();
export async function readOAuthBody(req) {
  if (parsedBodies.has(req)) return parsedBodies.get(req);
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 16384) throw new Error('Request too large');
  }
  const parsed = String(req.headers['content-type'] ?? '').includes('application/json')
    ? JSON.parse(data)
    : Object.fromEntries(new URLSearchParams(data));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid OAuth request body');
  parsedBodies.set(req, parsed);
  return parsed;
}
const body = readOAuthBody;
function validRedirect(value) {
  try {
    const u = new URL(value);
    return (
      !u.hash &&
      !u.username &&
      !u.password &&
      (u.protocol === 'https:' ||
        (u.protocol === 'http:' &&
          ['127.0.0.1', '[::1]', 'localhost'].includes(u.hostname)))
    );
  } catch {
    return false;
  }
}
function sessionBinding(token) {
  return hash(token);
}
const exp = (seconds) => Math.floor(Date.now() / 1000) + seconds;

/** Store put must create-only; take must be atomic across every serving instance.
 * Missing storage fails closed, never silently falls back to process memory.
 */
export async function handleOAuth(
  request,
  response,
  context,
  { assertResourceContextMatches, contextualUrl, requestResourceContext },
) {
  const url = new URL(request.url, 'http://localhost');
  if (
    !['/oauth/register', '/oauth/authorize', '/oauth/token', '/oauth/revoke'].includes(
      url.pathname,
    )
  )
    return false;
  try {
    const store = context.oauthStore;
    if (
      !store ||
      !['put', 'get', 'take'].every((k) => typeof store[k] === 'function')
    ) {
      fail(
        response,
        503,
        'temporarily_unavailable',
        'Persistent OAuth storage is not configured.',
      );
      return true;
    }
    if (url.pathname === '/oauth/register') {
      if (request.method !== 'POST') {
        fail(response, 405, 'invalid_request', 'POST required.');
        return true;
      }
      const b = await body(request);
      if (
        !Array.isArray(b.redirect_uris) ||
        !b.redirect_uris.length ||
        b.redirect_uris.length > 10 ||
        !b.redirect_uris.every(
          (v) => typeof v === 'string' && v.length <= 2048 && validRedirect(v),
        )
      ) {
        fail(
          response,
          400,
          'invalid_redirect_uri',
          'Valid HTTPS redirect URIs are required.',
        );
        return true;
      }
      const client = {
        client_id: 'swmcp_' + random(),
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: String(b.client_name || 'MCP Client').slice(0, 120),
        redirect_uris: [...new Set(b.redirect_uris)],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      };
      await store.put(
        'client',
        hash(client.client_id),
        client,
        exp(90 * 86400),
      );
      json(response, 201, client);
      return true;
    }
    if (url.pathname === '/oauth/token' || url.pathname === '/oauth/revoke') {
      if (request.method !== 'POST') {
        fail(response, 405, 'invalid_request', 'POST required.');
        return true;
      }
      const b = await body(request);
      const binding = {...credentialBinding(context, requestResourceContext(request)), client_id: b.client_id};
      if (b.resource && b.resource !== binding.audience || b.scope && b.scope !== 'mcp') {
        fail(response, 400, 'invalid_target', 'Resource and scope must match the authorized resource.'); return true;
      }
      if (url.pathname === '/oauth/revoke') {
        if (!b.client_id || !(await store.get('client', hash(b.client_id)))) {
          fail(response, 400, 'invalid_client', 'Registered client required.'); return true;
        }
        await revokeCredential(String(b.token ?? ''), binding, context);
        json(response, 200, {}); return true;
      }
      if (b.grant_type === 'refresh_token') {
        if (!b.client_id || !(await store.get('client', hash(b.client_id)))) {
          fail(response, 400, 'invalid_grant', 'Registered client required.'); return true;
        }
        const pair = await rotateRefreshToken(String(b.refresh_token ?? ''), binding, context);
        if (!pair) fail(response, 400, 'invalid_grant', 'Refresh token is invalid, expired or reused.');
        else json(response, 200, pair);
        return true;
      }
      if (b.grant_type !== 'authorization_code') {
        fail(
          response,
          400,
          'unsupported_grant_type',
          'authorization_code required.',
        );
        return true;
      }
      const key = hash(String(b.code ?? ''));
      const record = await store.get('code', key);
      if (
        !record ||
        record.expires_at <= Date.now() / 1000 ||
        !b.client_id ||
        b.client_id !== record.client_id ||
        b.redirect_uri !== record.redirect_uri ||
        record.issuer !== binding.issuer || record.audience !== binding.audience ||
        record.scope !== binding.scope || !context.resourceContext.equals(record.resource_context, binding.resource_context) ||
        typeof b.code_verifier !== 'string' ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(b.code_verifier) ||
        createHash('sha256').update(b.code_verifier).digest('base64url') !==
          record.code_challenge
      ) {
        fail(
          response,
          400,
          'invalid_grant',
          'Invalid or expired authorization code, client, redirect or PKCE verifier.',
        );
        return true;
      }
      const client = await store.get('client', hash(b.client_id));
      if (!client?.redirect_uris.includes(record.redirect_uri)) {
        fail(
          response,
          400,
          'invalid_grant',
          'Client registration is unavailable.',
        );
        return true;
      }
      const consumed = await store.take('code', key);
      if (!consumed || consumed.expires_at <= Date.now() / 1000) {
        fail(
          response,
          400,
          'invalid_grant',
          'Authorization code was already used or expired.',
        );
        return true;
      }
      json(response, 200, await issueTokenFamily(consumed, binding, context));
      return true;
    }
    if (!['GET', 'POST'].includes(request.method)) {
      fail(response, 405, 'invalid_request', 'GET or POST required.');
      return true;
    }
    const token = readBrowserToken(request);
    const session = await verifyDurableToken(token, context, 'browser_session', requestResourceContext(request));
    let p;
    if (request.method === 'GET') {
      p = Object.fromEntries(url.searchParams);
      const client = await store.get('client', hash(String(p.client_id ?? '')));
      if (
        p.response_type !== 'code' ||
        !client ||
        !client.redirect_uris.includes(p.redirect_uri) ||
        p.code_challenge_method !== 'S256' ||
        !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge ?? '') ||
        (p.scope && p.scope !== 'mcp')
        || (p.resource && p.resource !== credentialBinding(context, requestResourceContext(request)).audience)
      ) {
        fail(
          response,
          400,
          'invalid_request',
          'Registered client, exact redirect URI and S256 PKCE are required.',
        );
        return true;
      }
      if (!session) {
        redirect(
          response,
          contextualUrl(
            '/auth/login?next=' + encodeURIComponent(url.pathname + url.search),
            requestResourceContext(request),
            context,
          ),
        );
        return true;
      }
      assertResourceContextMatches(session, request, context);
      const consentToken = random();
      const record = {
        ...p,
        expires_at: exp(300),
        session_binding: sessionBinding(token),
        resource_context: requestResourceContext(request),
      };
      await store.put('consent', hash(consentToken), record, record.expires_at);
      const zh = String(request.headers['accept-language'] ?? '')
        .toLowerCase()
        .startsWith('zh');
      const title = zh ? '授權 SlimWeb MCP' : 'Authorize SlimWeb MCP';
      const sites = await context.accountRepository.listSitesForAdminIdentity({
        account_id: session.account_id,
        email: session.email,
        google_id: session.google_id,
        site_id: session.site_id,
        resource_context: session.resource_context ?? null,
        backend_grant: session.backend_grant,
      });
      const names = sites.map((s) => escape(s.name ?? s.site_code)).join(', ');
      const text = zh
        ? '此應用程式將可依照你的後台權限讀取及修改以下網站，包括訂單、會員、內容與整合設定。'
        : 'This application can read and modify these websites according to your admin permissions, including orders, members, content and integration settings.';
      const action = contextualUrl(
        '/oauth/authorize',
        requestResourceContext(request),
        context,
      );
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'content-security-policy':
          // Chromium also checks the form's redirect destination. Only allow
          // the origin of the exact registered callback validated above.
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' " + new URL(p.redirect_uri).origin + "; frame-ancestors 'none'; base-uri 'none'",
      });
      response.end(
        '<!doctype html><html lang="' +
          (zh ? 'zh-Hant' : 'en') +
          '"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
          title +
          '</title><main style="max-width:640px;margin:48px auto;font-family:system-ui;line-height:1.6"><h1>' +
          title +
          '</h1><p>' +
          escape(client.client_name) +
          '</p><p>' +
          escape(session.email) +
          '</p><p>' +
          text +
          '</p><p>' +
          names +
          '</p><p>' +
          escape(p.redirect_uri) +
          '</p><form method="post" action="' +
          escape(action) +
          '"><input type="hidden" name="consent_token" value="' +
          consentToken +
          '"><button name="decision" value="allow">✓ ' +
          (zh ? '允許授權' : 'Allow') +
          '</button> <button name="decision" value="deny">✕ ' +
          (zh ? '拒絕' : 'Deny') +
          '</button></form></main></html>',
      );
      return true;
    }
    if (!session) {
      fail(response, 401, 'access_denied', 'Login required.');
      return true;
    }
    assertResourceContextMatches(session, request, context);
    const b = await body(request);
    const key = hash(String(b.consent_token ?? ''));
    p = await store.get('consent', key);
    if (
      !p ||
      p.expires_at <= Date.now() / 1000 ||
      p.session_binding !== sessionBinding(token) ||
      !context.resourceContext.equals(
        p.resource_context,
        requestResourceContext(request),
      ) ||
      !['allow', 'deny'].includes(b.decision)
    ) {
      fail(response, 400, 'invalid_request', 'Invalid or expired consent.');
      return true;
    }
    p = await store.take('consent', key);
    if (!p || p.expires_at <= Date.now() / 1000) {
      fail(
        response,
        400,
        'invalid_request',
        'Consent was already used or expired.',
      );
      return true;
    }
    const callback = new URL(p.redirect_uri);
    if (p.state) callback.searchParams.set('state', p.state);
    if (b.decision === 'deny')
      callback.searchParams.set('error', 'access_denied');
    else {
      const code = random();
      const record = {
        account_id: session.account_id,
        backend_grant: session.backend_grant,
        session_id: session.jti,
        ...credentialBinding(context, requestResourceContext(request)),
        email: session.email,
        name: session.name,
        google_id: session.google_id,
        resource_context: session.resource_context ?? null,
        client_id: p.client_id,
        redirect_uri: p.redirect_uri,
        code_challenge: p.code_challenge,
        expires_at: exp(120),
      };
      await store.put('code', hash(code), record, record.expires_at);
      callback.searchParams.set('code', code);
    }
    redirect(response, callback.toString());
    return true;
  } catch (error) {
    fail(
      response,
      error.status === 401 ? 401 : 503,
      error.status === 401 ? 'access_denied' : 'temporarily_unavailable',
      error.status === 401
        ? 'Session resource mismatch.'
        : 'OAuth request could not be completed.',
    );
    return true;
  }
}
