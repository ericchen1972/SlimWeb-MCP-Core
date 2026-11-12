import {createSignedToken,verifySignedToken} from '../src/session.js';
// Explicit request-local fixture credential; no production authorizer accepts it.
export function createTestServiceToken(identity,secret,now=Date.now(),claims={}) {
  return createSignedToken({...identity,...claims,typ:'test_service',exp:Math.floor(now/1000)+300},secret);
}
export const testServiceResolver = secret => request => {
  const record=verifySignedToken(String(request.headers.authorization ?? '').replace(/^Bearer /i,''),secret);
  return record?.typ==='test_service' && record.exp>Date.now()/1000 ? record : null;
};
export function testStore() {
  const rows = new Map();
  return {
    async put(kind, key, value, exp) { if (rows.has(kind + key)) throw Error('exists'); rows.set(kind + key, {value, exp}); },
    async get(kind, key) { const row = rows.get(kind + key); return row?.exp > Date.now()/1000 ? row.value : null; },
    async take(kind, key) { const row = rows.get(kind + key); rows.delete(kind + key); return row?.exp > Date.now()/1000 ? row.value : null; }
  };
}
