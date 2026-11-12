// Final defense only: backend helpers must still project approved response fields.
const normalize = key => key.replace(/[^a-z0-9]/gi, '').toLowerCase();
const forbidden = key => /(?:password|passwd|secret|apikey|accesstoken|refreshtoken|notiontoken|idtoken|privatekey|signingkey|hashkey|hashiv|backendgrant|credential)/.test(key)
  || ['authorization', 'cookie', 'setcookie', 'token'].includes(key);

export function redactToolResult(value) {
  if (Array.isArray(value)) return value.map(redactToolResult);
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
      const normalized = normalize(key);
      if (forbidden(normalized)) {
        if (normalized.startsWith('has') && typeof entry === 'boolean') result[key] = entry;
        continue;
      }
      // MCP text mirrors are JSON: apply the same defense to both representations.
      if (key === 'text' && typeof entry === 'string' && /^[\s]*[\[{]/.test(entry)) {
        try { result[key] = JSON.stringify(redactToolResult(JSON.parse(entry))); continue; } catch { /* ordinary text */ }
      }
      result[key] = redactToolResult(entry);
    }
    return result;
  }
  return value;
}
