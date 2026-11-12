import { createPublicKey, verify as verifySignature } from 'node:crypto';

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
function invalid() {
  return Object.assign(new Error('Invalid Google credential.'), { code: 'INVALID_GOOGLE_CREDENTIAL' });
}
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalid();
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

export class GoogleIdentityVerifier {
  constructor({ clientId = process.env.GOOGLE_CLIENT_ID, fetchImpl = fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
    this.clientId = clientId;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.keys = [];
    this.keysExpireAt = 0;
    this.lastFetchAt = -Infinity;
  }

  async loadKeys() {
    if (this.loading) return this.loading;
    // Unknown key IDs cannot turn arbitrary credentials into an unbounded Google request flood.
    if (this.now() - this.lastFetchAt < 30) return;
    this.lastFetchAt = this.now();
    this.loading = (async () => {
      const response = await this.fetchImpl(JWKS_URL, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!response.ok || Number(response.headers.get('content-length') || 0) > 65536) throw invalid();
      let bytes = 0;
      const chunks = [];
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 65536) throw invalid();
        chunks.push(Buffer.from(chunk));
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Array.isArray(payload.keys) || payload.keys.length > 20) throw invalid();
      this.keys = payload.keys.filter(key => key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig' && typeof key.kid === 'string');
      const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 300);
      this.keysExpireAt = this.now() + Math.min(Math.max(maxAge, 0), 21600);
    })();
    try { await this.loading; } finally { this.loading = null; }
  }

  async verify(credential) {
    try {
      if (!this.clientId || typeof credential !== 'string' || credential.length > 16384) throw invalid();
      const parts = credential.split('.');
      if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[2])) throw invalid();
      const header = decode(parts[0]);
      if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 256 || header.crit) throw invalid();
      if (this.now() >= this.keysExpireAt || !this.keys.some(key => key.kid === header.kid)) await this.loadKeys();
      const key = this.keys.find(key => key.kid === header.kid);
      if (!key || this.now() >= this.keysExpireAt || !verifySignature('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw invalid();
      const payload = decode(parts[1]);
      const now = this.now();
      if (payload.aud !== this.clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)
        || !Number.isInteger(payload.exp) || payload.exp <= now
        || !Number.isInteger(payload.iat) || payload.iat > now + 60 || payload.iat >= payload.exp
        || payload.email_verified !== true || typeof payload.sub !== 'string' || !payload.sub
        || typeof payload.email !== 'string' || !payload.email || (payload.azp && payload.azp !== this.clientId)) throw invalid();
      return { sub: payload.sub, email: payload.email, name: String(payload.name ?? payload.email), picture: String(payload.picture ?? '') };
    } catch { throw invalid(); }
  }
}
