// Production is the default. Development/test exceptions require an explicit runtime mode.
export function resolveRuntimeConfig(options = {}, env = process.env) {
  const runtimeMode = options.runtimeMode ?? env.NODE_ENV ?? 'production';
  if (!['production', 'development', 'test'].includes(runtimeMode)) throw new Error('Invalid MCP runtime mode.');
  const localMode = runtimeMode !== 'production';
  const googleClientId = String(options.googleClientId ?? env.GOOGLE_CLIENT_ID ?? '').trim();
  let publicBaseUrl = String(options.publicBaseUrl ?? env.PUBLIC_BASE_URL ?? '').trim();
  const secureCookies = options.secureCookies ?? true;
  if (!localMode && (!googleClientId || !publicBaseUrl || secureCookies !== true)) {
    throw new Error('Production MCP requires GOOGLE_CLIENT_ID, HTTPS PUBLIC_BASE_URL and secure cookies.');
  }
  if (publicBaseUrl) {
    let url;
    try { url = new URL(publicBaseUrl); } catch { throw new Error('Invalid PUBLIC_BASE_URL.'); }
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(localMode && loopback && url.protocol === 'http:'))
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('PUBLIC_BASE_URL must be a canonical HTTPS origin.');
    }
    publicBaseUrl = url.origin;
  }
  return { runtimeMode, googleClientId, publicBaseUrl, secureCookies };
}
