# VSCode Workspace Sidebar

## Summary

Add a button in the Chat page TitleBar that opens a right-side panel containing an embedded VSCode instance (via `code serve-web`) showing the current Agent's workspace directory. The backend manages the `code serve-web` process lifecycle and provides a reverse proxy so the frontend iframe can access it same-origin. The sidebar uses a resizable split layout with a draggable divider.

## Motivation

When an Agent is working in a workspace, users want to see and interact with the files in real-time — browsing the file tree, reading code, editing files, running terminal commands — without leaving the Chat interface. Embedding a full VSCode instance provides the most complete and familiar developer experience.

## Design Decisions

| Decision            | Choice                                  | Rationale                                                                                                                    |
| ------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| VSCode backend      | `code serve-web` (built-in VSCode CLI)  | Zero extra installation, Microsoft extension marketplace access, always matches local VSCode version                         |
| Embedding method    | Koa reverse proxy + iframe              | Same-origin avoids cookie/CSP/CORS issues; `code serve-web` has `SameSite=Strict` cookies that break in cross-origin iframes |
| Process lifecycle   | Tied to backend process                 | Starts with backend, stops when backend exits; avoids startup delay when opening sidebar                                     |
| Port configuration  | Fixed port via `VSCODE_PORT` env var    | Parsing stdout for port is fragile; fixed port is simple and reliable                                                        |
| Sidebar layout      | Left-right split with draggable divider | User can adjust proportions based on their needs                                                                             |
| Workspace switching | Auto-follow via iframe `?folder=` param | When user switches Chat sessions, sidebar automatically shows the new session's workspace                                    |

## Architecture

### Backend: Process Management

A new module `vscode-server-manager` handles the `code serve-web` lifecycle:

1. **Startup**: On backend boot, spawn `code serve-web --without-connection-token --port ${VSCODE_PORT} --accept-server-license-terms` as a child process.
2. **Health tracking**: Monitor the child process state. Expose status via `GET /api/vscode/status` returning `{ available: true/false }`.
3. **Graceful shutdown**: Register handlers on `process.on('exit')`, `SIGTERM`, `SIGINT` to kill the child process before the backend exits.
4. **Auto-restart on crash**: Listen to the child process `close` event. If exit code is non-zero and the shutdown wasn't intentional, restart the process. Rate-limit restarts (max 3 within 30 seconds) to avoid infinite restart loops.
5. **VSCode not installed**: If `code` command is not found, log a warning and mark the service as unavailable. The frontend hides the button.

### Backend: Reverse Proxy

Add a Koa middleware/route at `/api/vscode/(.*)` that:

1. Proxies HTTP requests to `http://127.0.0.1:${VSCODE_PORT}` using `http-proxy`.
2. Handles WebSocket upgrade events (required for VSCode's real-time features).
3. Rewrites response headers as needed (strip/adjust CSP `'self'` references to match the proxy origin).

### Frontend: UI Components

**New components:**

- **`VSCodePanel`**: Renders an iframe pointing to `/api/vscode/?folder=<workspace>`. Shows a loading indicator while iframe loads. Displays an error message if VSCode is unavailable.
- **`ResizableSplitPane`**: A generic horizontal split container with a draggable divider. Manages drag state via `mousedown`/`mousemove`/`mouseup`. Sets `flex-basis` or `width` for each pane. Enforces minimum widths (Chat: 300px, VSCode: 400px).

**Modified components:**

- **`TitleBar`**: Add a toggle button (Lucide `PanelRight` or `Code` icon) on the right side to open/close the sidebar.
- **`ChatPageView`**: Wrap Chat content and VSCodePanel in `ResizableSplitPane` when sidebar is open. Read workspace from `SessionConfigContext` to pass to VSCodePanel.

**Layout behavior:**

```
Sidebar closed (default):
┌─────────────────────────────────┐
│  TitleBar            [VSCode]   │
├─────────────────────────────────┤
│  Messages (full width)          │
├─────────────────────────────────┤
│  InfoBar                        │
├─────────────────────────────────┤
│  ChatInput                      │
└─────────────────────────────────┘

Sidebar open:
┌───────────────────┬─────────────────┐
│  TitleBar  [Close] │                 │
├───────────────────┤                 │
│  Messages         ┃  VSCode iframe  │
├───────────────────┃                 │
│  InfoBar          ┃                 │
├───────────────────┃                 │
│  ChatInput        │                 │
└───────────────────┴─────────────────┘
                    ┃ ← draggable divider
```

Default split ratio: 50:50. Minimum widths prevent either pane from collapsing to unusable size.

**Workspace switching:**

When the user switches to a different Chat session with a different workspace, the frontend updates the iframe `src` to `/api/vscode/?folder=<newWorkspace>`. This causes VSCode to reload with the new directory.

## Error Handling

| Scenario                          | Behavior                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| VSCode CLI (`code`) not installed | Backend logs warning, marks service unavailable. Frontend hides the sidebar toggle button.                    |
| `code serve-web` process crashes  | Backend auto-restarts (up to 3 times in 30s). Frontend iframe shows VSCode's own error page or loading state. |
| Session has no workspace          | Sidebar toggle button is disabled/hidden.                                                                     |
| iframe load timeout/failure       | `VSCodePanel` shows an error message with a retry button.                                                     |

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
