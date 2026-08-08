export function createNullResourceContext() {
  return Object.freeze({
    parse() {
      return null;
    },
    async validateAfterIdentity(resourceContext) {
      return resourceContext;
    },
    equals(left, right) {
      return left === null && right === null;
    },
    appendToUrl(pathname) {
      return pathname;
    },
    resourceUrl(publicBaseUrl) {
      return `${String(publicBaseUrl).replace(/\/+$/, '')}/mcp`;
    }
  });
}

export function resourceContextMismatchError() {
  const error = new Error('The authenticated session belongs to another resource context.');
  error.code = 'DOMAIN_SESSION_MISMATCH';
  error.status = 401;
  return error;
}
