import { createHash, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'swmcp_session';

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSignedToken(payload, secret) {
  if (!secret) {
    throw new Error('MCP_SESSION_SECRET is required.');
  }

  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function verifySignedToken(token, secret) {
  if (typeof token !== 'string' || !secret || token.split('.').length !== 2) {
    return null;
  }

  const [encodedPayload, signature] = token.split('.', 2);
  const expected = sign(encodedPayload, secret);

  if (!safeEqual(signature, expected)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function sessionCookie(token, secure = true) {
  const attributes = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${BROWSER_TTL}`
  ];

  if (secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

// Signed v2 credentials identify durable records; stored identity is authoritative.
export const ACCESS_TTL = 900;
export const BROWSER_TTL = 8 * 3600;
const FAMILY_TTL = 30 * 86400;
const digest = value => createHash('sha256').update(String(value)).digest('hex');
const opaque = () => randomBytes(32).toString('base64url');
const seconds = () => Math.floor(Date.now() / 1000);
function storage(context) {
  const s = context.oauthStore;
  if (!s || !['put', 'get', 'take'].every(k => typeof s[k] === 'function')) throw new Error('Persistent credential storage is required.');
  return s;
}
export function credentialBinding(context, resourceContext) {
  const issuer = String(context.publicBaseUrl || '').replace(/\/+$/, '');
  return {issuer, audience: context.resourceContext.resourceUrl(issuer, resourceContext), resource_context: resourceContext, scope: 'mcp'};
}
export async function issueBrowserSession(identity, context, resourceContext) {
  const record = {...identity, ...credentialBinding(context, resourceContext), typ: 'browser_session', version: 2, jti: opaque(), exp: seconds() + BROWSER_TTL};
  await storage(context).put('session', digest(record.jti), record, record.exp);
  return createSignedToken({typ: record.typ, version: 2, jti: record.jti, exp: record.exp}, context.sessionSecret);
}
async function familyIsActive(record, context) {
  const s = storage(context);
  return !!(await s.get('family', digest(record.family_id))) && !(await s.get('revoked_family', digest(record.family_id))) && (!record.session_id || !(await s.get('revoked_family', digest('session:' + record.session_id))));
}
export async function verifyDurableToken(token, context, type, resourceContext) {
  const claim = verifySignedToken(token, context.sessionSecret);
  if (!claim || claim.version !== 2 || claim.typ !== type || !claim.jti || claim.exp <= seconds()) return null;
  const kind = type === 'browser_session' ? 'session' : type === 'access' ? 'access' : null;
  if (!kind) return null;
  const record = await storage(context).get(kind, digest(claim.jti));
  const binding = credentialBinding(context, resourceContext);
  if (!record || record.typ !== type || record.exp !== claim.exp || record.exp <= seconds() || record.issuer !== binding.issuer || record.audience !== binding.audience || record.scope !== 'mcp' || !context.resourceContext.equals(record.resource_context, resourceContext)) return null;
  if (type === 'access' && (!record.client_id || !(await familyIsActive(record, context)))) return null;
  return record;
}
async function issuePair(family, context) {
  const s = storage(context), now = seconds();
  const access = {...family, typ: 'access', version: 2, jti: opaque(), exp: Math.min(now + ACCESS_TTL, family.expires_at)};
  const refresh = opaque(), refreshRecord = {...family};
  await s.put('access', digest(access.jti), access, access.exp);
  await s.put('refresh_history', digest(refresh), refreshRecord, family.expires_at);
  await s.put('refresh', digest(refresh), refreshRecord, family.expires_at);
  return {access_token: createSignedToken({typ: 'access', version: 2, jti: access.jti, exp: access.exp}, context.sessionSecret), refresh_token: refresh, token_type: 'Bearer', expires_in: access.exp - now, scope: family.scope};
}
export async function issueTokenFamily(identity, binding, context) {
  const family = {...identity, ...binding, family_id: opaque(), expires_at: seconds() + FAMILY_TTL};
  await storage(context).put('family', digest(family.family_id), family, family.expires_at);
  return issuePair(family, context);
}
function sameBinding(record, binding, context) {
  return record.client_id === binding.client_id && record.issuer === binding.issuer && record.audience === binding.audience && record.scope === binding.scope && context.resourceContext.equals(record.resource_context, binding.resource_context);
}
async function revokeFamily(record, context) {
  const s = storage(context), key = digest(record.family_id);
  try { await s.put('revoked_family', key, {revoked: true}, record.expires_at); }
  catch (error) { if (error.status !== 409 || !(await s.get('revoked_family', key))) throw error; }
}
export async function rotateRefreshToken(token, binding, context) {
  const s = storage(context), key = digest(token);
  const history = await s.get('refresh_history', key);
  if (!history || history.expires_at <= seconds() || !sameBinding(history, binding, context)) return null;
  const record = await s.take('refresh', key);
  if (!record) { await revokeFamily(history, context); return null; }
  if (!(await familyIsActive(record, context))) return null;
  return issuePair(record, context);
}
export async function revokeCredential(token, binding, context) {
  const s = storage(context), claim = verifySignedToken(token, context.sessionSecret);
  const record = claim?.typ === 'access' && claim.version === 2 ? await s.get('access', digest(claim.jti)) : await s.get('refresh_history', digest(token));
  if (record && sameBinding(record, binding, context)) await revokeFamily(record, context);
}
export async function logoutBrowserSession(token, context, resourceContext) {
  const record = await verifyDurableToken(token, context, 'browser_session', resourceContext);
  if (!record) return;
  const s = storage(context), key = digest('session:' + record.jti);
  try { await s.put('revoked_family', key, {revoked: true}, seconds() + FAMILY_TTL); }
  catch (error) { if (error.status !== 409 || !(await s.get('revoked_family', key))) throw error; }
  await storage(context).take('session', digest(record.jti));
}
export function readBrowserToken(request) {
  const cookie = String(request.headers.cookie ?? '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE_NAME + '='));
  try { return cookie ? decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1)) : ''; } catch { return ''; }
}
