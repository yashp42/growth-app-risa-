/** HTTP POST also carries read-only metric queries; only mutations invalidate workspaces. */
export function changesWorkspaceData(path: string, method = 'GET'): boolean {
  if (!/^(POST|PATCH|PUT|DELETE)$/i.test(method)) return false;
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/$/, '');
  if (!pathname.startsWith('/api/')) return false;
  if (/^\/api\/(auth|metrics)(\/|$)/.test(pathname)) return false;
  if (pathname === '/api/admin/parity') return false;
  if (pathname.startsWith('/api/ai/')) {
    return method.toUpperCase() === 'POST' && /^\/api\/ai\/actions\/batch\/[^/]+\/confirm$/.test(pathname);
  }
  return true;
}
