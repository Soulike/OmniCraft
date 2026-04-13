# VSCode Workspace Viewer

## Summary

Add a button in the Chat page TitleBar that opens the current Agent's workspace in a new browser tab via an embedded VSCode instance (`code serve-web`). The backend manages the `code serve-web` process lifecycle and provides a reverse proxy so the frontend can access it through the same origin (required for remote access scenarios).

## Motivation

When an Agent is working in a workspace, users want to see and interact with the files in real-time — browsing the file tree, reading code, editing files, running terminal commands — without leaving the Chat interface. Embedding a full VSCode instance provides the most complete and familiar developer experience.

## Design Decisions

| Decision           | Choice                                 | Rationale                                                                                                           |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| VSCode backend     | `code serve-web` (built-in VSCode CLI) | Zero extra installation, Microsoft extension marketplace access, always matches local VSCode version                |
| Access method      | New browser tab via reverse proxy URL  | Simpler than embedded iframe split pane; reverse proxy required so remote users can reach VSCode through the server |
| Process lifecycle  | Tied to backend process                | Starts with backend, stops when backend exits; avoids startup delay when opening the tab                            |
| Port configuration | Fixed port via `VSCODE_PORT` env var   | Parsing stdout for port is fragile; fixed port is simple and reliable                                               |

## Architecture

### Backend: Process Management

A new module `vscode-server-manager` handles the `code serve-web` lifecycle:

1. **Startup**: On backend boot, spawn `code serve-web --without-connection-token --port ${VSCODE_PORT} --accept-server-license-terms` as a child process.
2. **Health tracking**: Monitor the child process state. Expose status via `GET /api/vscode/status` returning `{ available: boolean }`.
3. **Graceful shutdown**: Register handlers on `process.on('exit')`, `SIGTERM`, `SIGINT` to kill the child process before the backend exits.
4. **Auto-restart on crash**: Listen to the child process `close` event. If exit code is non-zero and the shutdown wasn't intentional, restart the process. Rate-limit restarts (max 3 within 30 seconds) to avoid infinite restart loops.
5. **VSCode not installed**: If `code` command is not found, log a warning and mark the service as unavailable. The frontend hides the button.

### Backend: Reverse Proxy

Add a Koa middleware/route at `/api/vscode/(.*)` that:

1. Proxies HTTP requests to `http://127.0.0.1:${VSCODE_PORT}` using `http-proxy`.
2. Handles WebSocket upgrade events (required for VSCode's real-time features).
3. Rewrites response headers as needed (strip/adjust CSP references to match the proxy origin).

This reverse proxy is essential for remote access — when the backend runs on a remote server, users cannot directly reach `localhost:${VSCODE_PORT}` on that machine. The proxy makes VSCode accessible through the same origin as the application.

### Frontend: UI Changes

**Modified components:**

- **`TitleBar`**: Add a toggle button (Lucide `Code` icon) on the right side. On click, call `window.open('/api/vscode/?folder=<workspace>')` to open VSCode in a new browser tab.
- The button is hidden when VSCode is unavailable (check `GET /api/vscode/status`) or when the current session has no workspace.

**No new components required.**

## Error Handling

| Scenario                          | Behavior                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| VSCode CLI (`code`) not installed | Backend logs warning, marks service unavailable. Frontend hides the button.                |
| `code serve-web` process crashes  | Backend auto-restarts (up to 3 times in 30s). User can refresh the tab.                    |
| Session has no workspace          | Button is hidden.                                                                          |
| VSCode tab fails to load          | User sees VSCode's own error page in the tab; can close and retry via the TitleBar button. |

## API Endpoints

| Method | Path                 | Description                                                                |
| ------ | -------------------- | -------------------------------------------------------------------------- |
| `GET`  | `/api/vscode/status` | Returns `{ available: boolean }` indicating if `code serve-web` is running |
| `ALL`  | `/api/vscode/(.*)`   | Reverse proxy to `code serve-web` (HTTP + WebSocket)                       |

## Environment Variables

| Variable      | Default | Description                            |
| ------------- | ------- | -------------------------------------- |
| `VSCODE_PORT` | `18927` | Port for `code serve-web` to listen on |

## Dependencies

| Package      | Purpose                                  |
| ------------ | ---------------------------------------- |
| `http-proxy` | HTTP and WebSocket reverse proxy for Koa |
