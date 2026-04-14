export const VSCODE_STATUS = '/vscode/status';
export const VSCODE_PROXY = '/vscode/{*path}';

/**
 * Full path prefix for VSCode WebSocket upgrade matching (includes `/api`).
 * Used by the server-level upgrade handler since upgrade events
 * arrive before Koa routing strips the `/api` prefix.
 */
export const VSCODE_WS_PREFIX = '/api/vscode';
