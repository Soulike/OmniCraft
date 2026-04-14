export const VSCODE_STATUS = '/vscode/status';
export const VSCODE_PROXY = '/vscode/{*path}';
export const VSCODE_ROOT = '/vscode';

/**
 * Full base path for the VSCode proxy (includes the `/api` prefix).
 * Used for `--server-base-path` and WebSocket upgrade path matching.
 */
export const VSCODE_BASE_PATH = '/api/vscode';
