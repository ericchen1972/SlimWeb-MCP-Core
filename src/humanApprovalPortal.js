import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE = '__Host-swmcp_approval';
const CHALLENGE = '__Host-swmcp_approval_challenge';
const random = () => randomBytes(32).toString('base64url');
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const js = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const now = () => Math.floor(Date.now() / 1000);
const OPERATION_LABELS = {
  slimweb_refunds_create: ['建立退款', 'Create refund'],
  slimweb_refunds_complete: ['完成退款', 'Complete refund'],
  slimweb_orders_delete: ['刪除訂單', 'Delete orders'],
  slimweb_invoices_void: ['作廢發票', 'Void invoice'],
  slimweb_invoices_allowance: ['開立發票折讓', 'Create invoice allowance'],
  slimweb_newsletters_create: ['建立電子報', 'Create newsletter'],
  slimweb_newsletters_update: ['更新電子報', 'Update newsletter'],
  slimweb_line_push_send: ['發送 LINE 群發訊息', 'Send LINE push messages'],
};

function audienceNotice(record, zh) {
  const audience = record.preview?.audience;
  if (
    ['slimweb_newsletters_create', 'slimweb_newsletters_update'].includes(
      record.operation,
    ) &&
    audience === 'all_active_members_at_delivery'
  ) {
    return zh
      ? '此電子報會寄送給寄送當下所有有效會員；收件名單會隨會員狀態變動，畫面人數僅供參考，並非固定收件名單。'
      : 'This newsletter will go to all active members at delivery time. The recipient list can change with member status. The displayed count is informational; it is not a frozen recipient list.';
  }
  if (record.operation === 'slimweb_line_push_send') {
    if (audience === 'all')
      return zh ? '發送範圍：LINE 所有好友。' : 'Audience: all LINE friends.';
    if (audience === 'members')
      return zh
        ? '發送範圍：準備時固定的會員收件名單。'
        : 'Audience: the member recipient list frozen at preparation.';
  }
  return '';
}

function equal(a, b) {
  return (
    typeof a === 'string' &&
    typeof b === 'string' &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
function mac(secret, value) {
  return createHmac('sha256', secret)
    .update('slimweb-human-approval-v1\0' + value)
    .digest('base64url');
}
function seal(value, secret) {
  const raw = Buffer.from(JSON.stringify(value)).toString('base64url');
  return raw + '.' + mac(secret, raw);
}
function readCookie(request, name, secret, purpose, binding) {
  try {
    const cookies = String(request.headers.cookie ?? '')
      .split(';')
      .map((c) => c.trim())
      .filter((c) => c.startsWith(name + '='));
    if (cookies.length !== 1) return null;
    const raw = cookies[0].slice(name.length + 1);
    if (raw.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw))
      return null;
    const [payload, sig] = raw.split('.');
    if (!equal(sig, mac(secret, payload))) return null;
    const value = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    if (
      value.purpose !== purpose ||
      !Number.isInteger(value.expires_at) ||
      value.expires_at <= now() ||
      value.expires_at >
        now() + (purpose === 'human_approval_challenge' ? 120 : 600)
    )
      return null;
    if (Object.entries(binding).some(([k, v]) => value[k] !== v)) return null;
    return value;
  } catch {
    return null;
  }
}
function cookie(name, value, seconds) {
  return `${name}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`;
}
function headers(nonce) {
  return {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'cross-origin-opener-policy': 'same-origin-allow-popups',
    'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}' https://accounts.google.com/gsi/; style-src 'unsafe-inline' https://accounts.google.com/gsi/; connect-src 'self' https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; img-src https://accounts.google.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
  };
}
function html(response, status, body, extra = {}, nonce = random()) {
  response.writeHead(status, { ...headers(nonce), ...extra });
  response.end(body);
}
function document(zh, title, body) {
  return `<!doctype html><html lang="${zh ? 'zh-Hant' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#f1f5f9;color:#0f172a;margin:0}main{box-sizing:border-box;max-width:760px;margin:40px auto;padding:24px;background:white;border:1px solid #e2e8f0;border-radius:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:55vh;overflow:auto;background:#f8fafc;padding:16px;border-radius:8px}button{font:inherit;border:1px solid #cbd5e1;border-radius:8px;padding:12px 20px;margin:4px;cursor:pointer}button[value=approve]{background:#1d4ed8;color:white}p{overflow-wrap:anywhere}@media(max-width:780px){main{margin:16px 12px;padding:20px}}</style></head><body><main><h1>🛡️ ${escape(title)}</h1>${body}</main></body></html>`;
}
async function body(request) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 24576) throw Object.assign(new Error('body'), { status: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const type = String(request.headers['content-type'] ?? '')
    .split(';')[0]
    .trim();
  if (type === 'application/json') return JSON.parse(raw);
  if (type === 'application/x-www-form-urlencoded')
    return Object.fromEntries(new URLSearchParams(raw));
  throw Object.assign(new Error('type'), { status: 415 });
}
function redirect(response, path, extra = {}) {
  response.writeHead(303, {
    location: path,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    ...extra,
  });
  response.end();
}

/** Dedicated browser-only approval flow. Ordinary OAuth sessions and Bearer tokens
 * are deliberately never read here; only a fresh Google proof can issue its ticket.
 * The backend remains authoritative for identity, roles, expiry and one-use decisions.
 */
export function createHumanApprovalPortal(context) {
  let windowStart = now(),
    requests = 0,
    logins = 0;
  return async function handle(request, response) {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/human-approvals/')) return false;
    const zh = String(request.headers['accept-language'] ?? 'en')
      .toLowerCase()
      .startsWith('zh');
    const title = zh ? '確認高風險操作' : 'Review sensitive action';
    const retry = new URL(url.pathname + url.search, 'https://local.invalid');
    retry.searchParams.set('action', 'signin');
    const loginAgain = `<p><a href="${escape(retry.pathname + retry.search)}">↻ ${zh ? '重新登入確認' : 'Sign in again to review'}</a></p>`;
    const fail = (status) =>
      html(
        response,
        status,
        document(
          zh,
          title,
          `<p>${zh ? '無法完成確認，請重新登入後再查看狀態。' : 'Unable to complete approval. Sign in again to review the current status.'}</p>${loginAgain}`,
        ),
      );
    try {
      const adapter = context.humanApprovalTransport;
      if (
        !adapter ||
        !['bootstrap', 'preview', 'decide'].every(
          (k) => typeof adapter[k] === 'function',
        ) ||
        typeof context.sessionSecret !== 'string' ||
        context.sessionSecret.length < 16 ||
        !context.publicBaseUrl ||
        !context.humanApprovalGoogleClientId
      ) {
        fail(503);
        return true;
      }
      if (now() - windowStart >= 60) {
        windowStart = now();
        requests = 0;
        logins = 0;
      }
      if (++requests > 3000) {
        response.setHeader('Retry-After', '60');
        fail(429);
        return true;
      }
      const match = url.pathname.match(
        /^\/human-approvals\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i,
      );
      const site = url.searchParams.getAll('site_code');
      if (
        !match ||
        site.length !== 1 ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(site[0]) ||
        url.searchParams.getAll('domain').length > 1
      ) {
        fail(400);
        return true;
      }
      const binding = {
        approval_id: match[1].toLowerCase(),
        site_code: site[0],
        domain: request.slimwebResourceContext ?? null,
      };
      const canonical = new URL(url.pathname, context.publicBaseUrl);
      canonical.searchParams.set('site_code', binding.site_code);
      if (binding.domain !== null)
        canonical.searchParams.set('domain', binding.domain);
      const path = canonical.pathname + canonical.search;
      if (!['GET', 'POST'].includes(request.method)) {
        fail(405);
        return true;
      }
      const secret = context.sessionSecret;
      const session =
        url.searchParams.get('action') === 'signin'
          ? null
          : readCookie(
              request,
              COOKIE,
              secret,
              'human_approval_session',
              binding,
            );
      const csrf = session
        ? mac(
            secret,
            'decision\0' +
              session.human_ticket +
              '\0' +
              JSON.stringify(binding),
          )
        : null;
      if (request.method === 'POST') {
        if (
          request.headers.origin !== new URL(context.publicBaseUrl).origin ||
          ['cross-site', 'none'].includes(request.headers['sec-fetch-site'])
        ) {
          fail(403);
          return true;
        }
        const input = await body(request);
        if (url.searchParams.get('action') === 'login') {
          if (++logins > 120) {
            response.setHeader('Retry-After', '60');
            fail(429);
            return true;
          }
          const challenge = readCookie(
            request,
            CHALLENGE,
            secret,
            'human_approval_challenge',
            binding,
          );
          if (
            !challenge ||
            !equal(input.csrf, challenge.csrf) ||
            !equal(input.nonce, challenge.nonce) ||
            typeof input.credential !== 'string' ||
            input.credential.length > 16384
          ) {
            fail(403);
            return true;
          }
          const issued = await adapter.bootstrap({
            credential: input.credential,
            nonce: challenge.nonce,
            ...binding,
          });
          if (
            !/^[A-Za-z0-9_-]{43}$/.test(issued?.human_ticket ?? '') ||
            !Number.isInteger(issued.expires_at) ||
            issued.expires_at <= now() ||
            issued.expires_at > now() + 600
          ) {
            fail(503);
            return true;
          }
          const value = {
            purpose: 'human_approval_session',
            ...binding,
            human_ticket: issued.human_ticket,
            expires_at: issued.expires_at,
          };
          redirect(response, path, {
            'set-cookie': [
              cookie(COOKIE, seal(value, secret), issued.expires_at - now()),
              cookie(CHALLENGE, '', 0),
            ],
          });
          return true;
        }
        if (
          url.searchParams.get('action') !== 'decide' ||
          !session ||
          !equal(input.csrf, csrf) ||
          !['approve', 'reject'].includes(input.decision)
        ) {
          fail(403);
          return true;
        }
        await adapter.decide({
          human_ticket: session.human_ticket,
          ...binding,
          decision: input.decision,
        });
        redirect(response, path);
        return true;
      }
      if (session) {
        const preview = await adapter.preview({
          human_ticket: session.human_ticket,
          ...binding,
        });
        const record = preview?.record;
        if (
          !record ||
          record.id !== binding.approval_id ||
          preview.site?.site_code !== binding.site_code ||
          !['pending', 'approved', 'rejected', 'consumed'].includes(
            record.status,
          )
        ) {
          fail(503);
          return true;
        }
        const text = zh
          ? '請親自核對網站、操作、對象、金額、內容與排程。核准後，回到原本的 AI 或後台重試完全相同的要求。'
          : 'Review the site, action, targets, amounts, content and schedule. After approval, return to your AI or admin and retry the exact request.';
        const details = JSON.stringify(
          { request: record.payload, targets: record.preview },
          null,
          2,
        );
        const labels = zh
          ? {
              pending: '待確認',
              approved: '已核准',
              rejected: '已拒絕',
              consumed: '已使用',
            }
          : {};
        const form =
          record.status === 'pending'
            ? `<form method="post" action="${escape(path + '&action=decide')}"><input type="hidden" name="csrf" value="${csrf}"><button name="decision" value="reject">✕ ${zh ? '拒絕' : 'Reject'}</button><button name="decision" value="approve">✓ ${zh ? '核准此要求' : 'Approve this request'}</button></form>`
            : `<p>${zh ? '此要求已處理。此頁不會執行原本的操作。' : 'This request has been decided. This page does not execute the original action.'}</p>`;
        const domain = binding.domain
          ? `<p>${zh ? '網站網域' : 'Merchant domain'}: <strong>${escape(binding.domain)}</strong></p>`
          : '';
        const operationLabel =
          OPERATION_LABELS[record.operation]?.[zh ? 0 : 1] ?? record.operation;
        const notice = audienceNotice(record, zh);
        html(
          response,
          200,
          document(
            zh,
            title,
            `<p>${text}</p><p>${escape(preview.site?.name)} (${escape(binding.site_code)})</p>${domain}<p>${escape(operationLabel)} (<code>${escape(record.operation)}</code>) · ${escape(labels[record.status] ?? record.status)} · ${escape(new Date(record.expires_at * 1000).toISOString())}</p>${notice ? `<p role="note">${escape(notice)}</p>` : ''}<pre>${escape(details)}</pre>${form}${loginAgain}`,
          ),
        );
        return true;
      }
      const nonce = random();
      const challenge = {
        purpose: 'human_approval_challenge',
        ...binding,
        nonce: random(),
        csrf: random(),
        expires_at: now() + 120,
      };
      const message = zh
        ? '請使用原本操作的 Google 帳號重新登入，查看固定預覽後親自核准。此次登入只用於確認這筆要求。'
        : 'Sign in again with the Google account that requested this action, then review and approve it. This login only authorizes review of this request.';
      const script = `window.approvalGoogleReady=function(){google.accounts.id.initialize({client_id:${js(context.humanApprovalGoogleClientId)},nonce:${js(challenge.nonce)},auto_select:false,callback:async function(result){try{const r=await fetch(${js(path + '&action=login')},{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',redirect:'manual',body:JSON.stringify({credential:result.credential,nonce:${js(challenge.nonce)},csrf:${js(challenge.csrf)}})});if(r.type==='opaqueredirect'||r.status===303){location.assign(${js(path)});return;}document.getElementById('error').textContent=${js(zh ? '登入未完成，請重新開啟確認連結。' : 'Login failed. Reopen the review link.')};}catch{document.getElementById('error').textContent=${js(zh ? '暫時無法登入，請稍後再試。' : 'Login unavailable. Try again later.')};}}});google.accounts.id.renderButton(document.getElementById('google-button'),{type:'standard',theme:'outline',text:'signin_with',size:'large'});};`;
      const load = `const gsi=document.createElement('script');gsi.src='https://accounts.google.com/gsi/client';gsi.nonce=${js(nonce)};gsi.async=true;gsi.onload=window.approvalGoogleReady;document.head.append(gsi);`;
      html(
        response,
        200,
        document(
          zh,
          title,
          `<p>${message}</p><input type="hidden" name="google_nonce" value="${challenge.nonce}"><input type="hidden" name="csrf" value="${challenge.csrf}"><div id="google-button"></div><p id="error" role="alert"></p><script nonce="${nonce}">${script}${load}</script>`,
        ),
        { 'set-cookie': cookie(CHALLENGE, seal(challenge, secret), 120) },
        nonce,
      );
      return true;
    } catch (error) {
      const status = [400, 401, 403, 404, 409, 413, 415, 422, 429].includes(
        error.status,
      )
        ? error.status
        : 503;
      fail(status);
      return true;
    }
  };
}
