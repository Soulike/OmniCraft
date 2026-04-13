# VSCode Workspace Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Open in VSCode" button to the Chat TitleBar that opens the workspace in a new browser tab via a reverse-proxied `code serve-web` instance.

**Architecture:** The backend spawns `code serve-web` on boot and exposes it through a Koa reverse proxy at `/api/vscode/(.*)`. The frontend adds a single button to TitleBar that calls `window.open()` on the proxy URL.

**Tech Stack:** Koa, http-proxy, Node.js child_process, React, HeroUI, lucide-react

---

### Task 1: Add `VSCODE_PORT` environment variable

**Files:**

- Modify: `apps/backend/src/helpers/env.ts`
- Modify: `apps/backend/.env.example`

- [ ] **Step 1: Add `getVscodePort` to env helpers**

In `apps/backend/src/helpers/env.ts`, add:

```typescript
/** Returns the port for `code serve-web` from `VSCODE_PORT` env or defaults to `18927`. */
export function getVscodePort(): number {
  const raw = process.env.VSCODE_PORT;
  if (raw === undefined) {
    return 18927;
  }
  const port = Number(raw);
  assert(
    !Number.isNaN(port) && port > 0,
    'VSCODE_PORT must be a positive number',
  );
  return port;
}
```

- [ ] **Step 2: Add `VSCODE_PORT` to `.env.example`**

Append to `apps/backend/.env.example`:

```
# Port for the embedded VSCode web server (code serve-web).
# Defaults to 18927 if not set.
# VSCODE_PORT=18927
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/helpers/env.ts apps/backend/.env.example
git commit -m "feat(backend): add VSCODE_PORT environment variable"
```

---

### Task 2: Create `VscodeServerManager` singleton

**Files:**

- Create: `apps/backend/src/models/vscode-server-manager/vscode-server-manager.ts`
- Create: `apps/backend/src/models/vscode-server-manager/index.ts`

- [ ] **Step 1: Write the test**

Create `apps/backend/src/models/vscode-server-manager/vscode-server-manager.test.ts`:

```typescript
import {afterEach, describe, expect, it} from 'vitest';

import {VscodeServerManager} from './vscode-server-manager.js';

describe('VscodeServerManager', () => {
  afterEach(() => {
    VscodeServerManager.resetInstance();
  });

  it('throws if getInstance is called before create', () => {
    expect(() => VscodeServerManager.getInstance()).toThrow(
      'VscodeServerManager is not initialized',
    );
  });

  it('creates a singleton instance', () => {
    VscodeServerManager.create(0); // port 0 = don't actually start
    const instance = VscodeServerManager.getInstance();
    expect(instance).toBeInstanceOf(VscodeServerManager);
  });

  it('throws if create is called twice', () => {
    VscodeServerManager.create(0);
    expect(() => VscodeServerManager.create(0)).toThrow(
      'VscodeServerManager is already initialized',
    );
  });

  it('reports unavailable before start', () => {
    VscodeServerManager.create(0);
    expect(VscodeServerManager.getInstance().isAvailable()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun run test -- src/models/vscode-server-manager/vscode-server-manager.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `VscodeServerManager`**

Create `apps/backend/src/models/vscode-server-manager/vscode-server-manager.ts`:

```typescript
import assert from 'node:assert';
import {type ChildProcess, spawn} from 'node:child_process';

import {logger} from '@/logger.js';

const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 30_000;

export class VscodeServerManager {
  private static instance: VscodeServerManager | null = null;

  private readonly port: number;
  private process: ChildProcess | null = null;
  private available = false;
  private shuttingDown = false;
  private readonly restartTimestamps: number[] = [];

  private constructor(port: number) {
    this.port = port;
  }

  /** Creates the singleton instance. Does not start the process — call `start()` separately. */
  static create(port: number): VscodeServerManager {
    assert(
      VscodeServerManager.instance === null,
      'VscodeServerManager is already initialized.',
    );
    const manager = new VscodeServerManager(port);
    VscodeServerManager.instance = manager;
    return manager;
  }

  /** Returns the singleton instance. */
  static getInstance(): VscodeServerManager {
    assert(
      VscodeServerManager.instance !== null,
      'VscodeServerManager is not initialized. Call VscodeServerManager.create() first.',
    );
    return VscodeServerManager.instance;
  }

  /** Resets the singleton instance. Stops the process if running. */
  static resetInstance(): void {
    if (VscodeServerManager.instance) {
      VscodeServerManager.instance.stop();
    }
    VscodeServerManager.instance = null;
  }

  /** Returns whether the VSCode server is currently running. */
  isAvailable(): boolean {
    return this.available;
  }

  /** Returns the port the server listens on. */
  getPort(): number {
    return this.port;
  }

  /** Starts the `code serve-web` process. */
  start(): void {
    if (this.port === 0) {
      // Port 0 means "don't actually start" — used in tests.
      return;
    }
    this.spawn();
  }

  /** Stops the process gracefully. */
  stop(): void {
    this.shuttingDown = true;
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.available = false;
  }

  private spawn(): void {
    const args = [
      'serve-web',
      '--without-connection-token',
      '--port',
      this.port.toString(),
      '--accept-server-license-terms',
    ];

    logger.info({port: this.port}, 'Starting code serve-web');

    let child: ChildProcess;
    try {
      child = spawn('code', args, {stdio: 'ignore'});
    } catch {
      logger.warn('VSCode CLI (code) not found — VSCode server unavailable');
      this.available = false;
      return;
    }

    this.process = child;

    child.on('spawn', () => {
      this.available = true;
      logger.info({port: this.port}, 'code serve-web started');
    });

    child.on('error', (err) => {
      logger.warn({err}, 'code serve-web failed to start');
      this.available = false;
      this.process = null;
    });

    child.on('close', (code) => {
      this.available = false;
      this.process = null;

      if (this.shuttingDown) {
        return;
      }

      if (code !== 0) {
        logger.warn({exitCode: code}, 'code serve-web exited unexpectedly');
        this.maybeRestart();
      }
    });
  }

  private maybeRestart(): void {
    const now = Date.now();
    this.restartTimestamps.push(now);

    // Keep only timestamps within the restart window.
    while (
      this.restartTimestamps.length > 0 &&
      now - this.restartTimestamps[0]! > RESTART_WINDOW_MS
    ) {
      this.restartTimestamps.shift();
    }

    if (this.restartTimestamps.length > MAX_RESTARTS) {
      logger.error(
        `code serve-web crashed ${MAX_RESTARTS.toString()} times in ${(RESTART_WINDOW_MS / 1000).toString()}s — giving up`,
      );
      return;
    }

    logger.info('Restarting code serve-web...');
    this.spawn();
  }
}
```

- [ ] **Step 4: Create index file**

Create `apps/backend/src/models/vscode-server-manager/index.ts`:

```typescript
export {VscodeServerManager} from './vscode-server-manager.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/backend && bun run test -- src/models/vscode-server-manager/vscode-server-manager.test.ts`

Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/models/vscode-server-manager/
git commit -m "feat(backend): add VscodeServerManager for code serve-web lifecycle"
```

---

### Task 3: Initialize `VscodeServerManager` on backend startup

**Files:**

- Modify: `apps/backend/src/startup/init-services.ts`
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Add initialization in `init-services.ts`**

Import and initialize `VscodeServerManager` in `initServices()`. Add a new `initVscodeServer()` function:

```typescript
import {getVscodePort} from '@/helpers/env.js';
import {VscodeServerManager} from '@/models/vscode-server-manager/index.js';
```

Add to `initServices()` after the existing calls:

```typescript
initVscodeServer();
```

Add the function:

```typescript
/** Initializes and starts the VSCode web server. */
function initVscodeServer(): void {
  const manager = VscodeServerManager.create(getVscodePort());
  manager.start();
}
```

- [ ] **Step 2: Register shutdown handler in `index.ts`**

In `apps/backend/src/index.ts`, import `VscodeServerManager` and add to the existing `process.on('exit')` handler:

```typescript
import {VscodeServerManager} from '@/models/vscode-server-manager/index.js';
```

Update the exit handler:

```typescript
process.on('exit', () => {
  ShellCommandRunner.killAll();
  VscodeServerManager.resetInstance();
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/startup/init-services.ts apps/backend/src/index.ts
git commit -m "feat(backend): start VscodeServerManager on backend boot"
```

---

### Task 4: Install `http-proxy` and add reverse proxy dispatcher

**Files:**

- Modify: `apps/backend/package.json` (via `bun add`)
- Create: `apps/backend/src/dispatcher/vscode/path.ts`
- Create: `apps/backend/src/dispatcher/vscode/router.ts`
- Create: `apps/backend/src/dispatcher/vscode/index.ts`
- Modify: `apps/backend/src/dispatcher/index.ts`

- [ ] **Step 1: Install `http-proxy` and its types**

```bash
cd apps/backend && bun add http-proxy && bun add -d @types/http-proxy
```

- [ ] **Step 2: Create `path.ts`**

Create `apps/backend/src/dispatcher/vscode/path.ts`:

```typescript
export const VSCODE_STATUS = '/vscode/status';
export const VSCODE_PROXY = '/vscode/(.*)';
```

- [ ] **Step 3: Create `router.ts`**

Create `apps/backend/src/dispatcher/vscode/router.ts`:

```typescript
import httpProxy from 'http-proxy';
import Router from '@koa/router';
import {StatusCodes} from 'http-status-codes';

import {VscodeServerManager} from '@/models/vscode-server-manager/index.js';

import {VSCODE_PROXY, VSCODE_STATUS} from './path.js';

const router = new Router();

router.get(VSCODE_STATUS, (ctx) => {
  const manager = VscodeServerManager.getInstance();
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = {available: manager.isAvailable()};
});

/** Creates a proxy server and attaches WebSocket upgrade handling. */
export function createVscodeProxy(): {
  router: Router;
  handleUpgrade: (
    req: import('node:http').IncomingMessage,
    socket: import('node:stream').Duplex,
    head: Buffer,
  ) => void;
} {
  const manager = VscodeServerManager.getInstance();
  const port = manager.getPort();

  const proxy = httpProxy.createProxyServer({
    target: `http://127.0.0.1:${port.toString()}`,
    ws: true,
    changeOrigin: true,
  });

  proxy.on('error', (err, _req, res) => {
    if (res && 'writeHead' in res && typeof res.writeHead === 'function') {
      res.writeHead(502, {'Content-Type': 'text/plain'});
      res.end('VSCode server unavailable');
    }
  });

  // HTTP proxy route — matches all methods.
  router.all(VSCODE_PROXY, (ctx) => {
    const manager = VscodeServerManager.getInstance();
    if (!manager.isAvailable()) {
      ctx.response.status = StatusCodes.SERVICE_UNAVAILABLE;
      ctx.response.body = {error: 'VSCode server is not available'};
      return;
    }

    // Strip the /vscode prefix so the upstream receives the original path.
    ctx.req.url = '/' + (ctx.params[0] as string);

    return new Promise<void>((resolve, reject) => {
      proxy.web(ctx.req, ctx.res, {}, (err) => {
        if (err) {
          reject(err);
        } else {
          // Mark response as handled so Koa doesn't try to set headers.
          ctx.respond = false;
          resolve();
        }
      });
    });
  });

  /** Handle WebSocket upgrade for paths under /api/vscode/. */
  function handleUpgrade(
    req: import('node:http').IncomingMessage,
    socket: import('node:stream').Duplex,
    head: Buffer,
  ): void {
    const url = req.url;
    if (!url?.startsWith('/api/vscode/')) {
      return;
    }

    const manager = VscodeServerManager.getInstance();
    if (!manager.isAvailable()) {
      socket.destroy();
      return;
    }

    // Strip the /api/vscode prefix.
    req.url = url.replace('/api/vscode', '');
    proxy.ws(req, socket, head);
  }

  return {router, handleUpgrade};
}

export {router};
```

- [ ] **Step 4: Create `index.ts`**

Create `apps/backend/src/dispatcher/vscode/index.ts`:

```typescript
export {createVscodeProxy, router} from './router.js';
```

- [ ] **Step 5: Register vscode router in dispatcher**

In `apps/backend/src/dispatcher/index.ts`, add the import and router registration:

```typescript
import {router as vscodeRouter} from './vscode/index.js';
```

Add after the existing `apiRouter.use(...)` calls:

```typescript
apiRouter.use(vscodeRouter.routes(), vscodeRouter.allowedMethods());
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/dispatcher/vscode/ apps/backend/src/dispatcher/index.ts apps/backend/package.json apps/backend/bun.lock
git commit -m "feat(backend): add VSCode reverse proxy dispatcher"
```

Note: `bun.lock` may be at the workspace root. Stage whichever lockfile changed.

---

### Task 5: Wire up WebSocket upgrade in `index.ts`

**Files:**

- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Add WebSocket upgrade handling**

In `apps/backend/src/index.ts`, import `createVscodeProxy` and attach the upgrade handler to the HTTP server.

Add import:

```typescript
import {createVscodeProxy} from '@/dispatcher/vscode/index.js';
```

Change `app.listen(...)` to capture the server instance, and add upgrade handling:

```typescript
const server = app.listen(port, () => {
  logger.info(`Server is listening on port ${port.toString()}`);
});

// Attach WebSocket upgrade handler for VSCode proxy.
const {handleUpgrade} = createVscodeProxy();
server.on('upgrade', (req, socket, head) => {
  handleUpgrade(req, socket, head);
});
```

- [ ] **Step 2: Verify the backend starts without errors**

Run: `cd apps/backend && bun run dev`

Check logs for: "Starting code serve-web" (or "VSCode CLI (code) not found" if `code` is not installed — both are acceptable).

Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/index.ts
git commit -m "feat(backend): wire WebSocket upgrade for VSCode proxy"
```

---

### Task 6: Add VSCode API client function in frontend

**Files:**

- Create: `apps/frontend/src/api/vscode/vscode.ts`
- Create: `apps/frontend/src/api/vscode/index.ts`

- [ ] **Step 1: Create the API client**

Create `apps/frontend/src/api/vscode/vscode.ts`:

```typescript
const BASE = '/api/vscode';

/** Checks if the VSCode server is available. */
export async function getVscodeStatus(): Promise<{available: boolean}> {
  const res = await fetch(`${BASE}/status`);
  if (!res.ok) {
    return {available: false};
  }
  return res.json() as Promise<{available: boolean}>;
}

/** Returns the URL to open VSCode in a new tab for the given workspace folder. */
export function getVscodeUrl(workspace: string): string {
  return `${BASE}/?folder=${encodeURIComponent(workspace)}`;
}
```

- [ ] **Step 2: Create index file**

Create `apps/frontend/src/api/vscode/index.ts`:

```typescript
export {getVscodeStatus, getVscodeUrl} from './vscode.js';
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/vscode/
git commit -m "feat(frontend): add VSCode API client"
```

---

### Task 7: Create `useVscodeStatus` hook

**Files:**

- Create: `apps/frontend/src/pages/chat/hooks/useVscodeStatus.ts`

- [ ] **Step 1: Create the hook**

Create `apps/frontend/src/pages/chat/hooks/useVscodeStatus.ts`:

```typescript
import {useCallback, useEffect, useState} from 'react';

import {getVscodeStatus} from '@/api/vscode/index.js';

/** Polls the VSCode server status on mount. */
export function useVscodeStatus(): {available: boolean; loading: boolean} {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const {available} = await getVscodeStatus();
      setAvailable(available);
    } catch {
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return {available, loading};
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/pages/chat/hooks/useVscodeStatus.ts
git commit -m "feat(frontend): add useVscodeStatus hook"
```

---

### Task 8: Add VSCode button to TitleBar

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/TitleBar/TitleBarView.tsx`
- Modify: `apps/frontend/src/pages/chat/ChatPageView.tsx`
- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx`

- [ ] **Step 1: Update `TitleBarView` to accept and render VSCode button**

Modify `apps/frontend/src/pages/chat/components/TitleBar/TitleBarView.tsx`:

```typescript
import {Button, Tooltip} from '@heroui/react';
import {Code, MessageSquarePlus} from 'lucide-react';

import styles from './styles.module.css';

interface TitleBarViewProps {
  title: string | null;
  onNewSession: () => void;
  newSessionDisabled: boolean;
  onOpenVscode: (() => void) | null;
}

export function TitleBarView({
  title,
  onNewSession,
  newSessionDisabled,
  onOpenVscode,
}: TitleBarViewProps) {
  return (
    <div className={styles.container}>
      <div className={styles.left} />
      <h2 className={styles.title}>{title ?? 'New Session'}</h2>
      <div className={styles.right}>
        {onOpenVscode !== null && (
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size='sm'
                variant='ghost'
                aria-label='Open in VSCode'
                onPress={onOpenVscode}
              >
                <Code size={16} />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <p>Open workspace in VSCode</p>
            </Tooltip.Content>
          </Tooltip>
        )}
        <Tooltip delay={0}>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label='New session'
              isDisabled={newSessionDisabled}
              onPress={onNewSession}
            >
              <MessageSquarePlus size={16} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>New session</p>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `ChatPageView` to pass `onOpenVscode`**

In `apps/frontend/src/pages/chat/ChatPageView.tsx`, add `onOpenVscode` to props and pass to `TitleBarView`:

Add to `ChatPageViewProps`:

```typescript
onOpenVscode: (() => void) | null;
```

Pass to `TitleBarView`:

```typescript
<TitleBarView
  title={title}
  onNewSession={onNewSession}
  newSessionDisabled={newSessionDisabled}
  onOpenVscode={onOpenVscode}
/>
```

- [ ] **Step 3: Update `ChatPage` to wire up VSCode button logic**

In `apps/frontend/src/pages/chat/ChatPage.tsx`:

Add imports:

```typescript
import {getVscodeUrl} from '@/api/vscode/index.js';

import {useVscodeStatus} from './hooks/useVscodeStatus.js';
```

In `ChatPageContent`, add hook call and callback:

```typescript
const {available: vscodeAvailable} = useVscodeStatus();

const onOpenVscode = useMemo(() => {
  if (!vscodeAvailable || selectedWorkspace === undefined) {
    return null;
  }
  return () => {
    window.open(getVscodeUrl(selectedWorkspace), '_blank');
  };
}, [vscodeAvailable, selectedWorkspace]);
```

Pass to `ChatPageView`:

```typescript
<ChatPageView
  ...
  onOpenVscode={onOpenVscode}
/>
```

Note: `useMemo` is imported from `react`. Add it to the existing import if not already there.

- [ ] **Step 4: Verify lint and typecheck pass**

Run: `cd apps/frontend && bun run lint && bun run typecheck`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/chat/components/TitleBar/TitleBarView.tsx apps/frontend/src/pages/chat/ChatPageView.tsx apps/frontend/src/pages/chat/ChatPage.tsx
git commit -m "feat(frontend): add Open in VSCode button to TitleBar"
```

---

### Task 9: Final integration verification

- [ ] **Step 1: Run backend typecheck and lint**

```bash
cd apps/backend && bun run typecheck && bun run lint
```

Expected: No errors.

- [ ] **Step 2: Run backend tests**

```bash
cd apps/backend && bun run test
```

Expected: All tests pass.

- [ ] **Step 3: Run frontend typecheck and lint**

```bash
cd apps/frontend && bun run typecheck && bun run lint
```

Expected: No errors.

- [ ] **Step 4: Run frontend tests**

```bash
cd apps/frontend && bun run test
```

Expected: All tests pass.

- [ ] **Step 5: Manual smoke test**

1. Start backend: `cd apps/backend && bun run dev`
2. Check logs for "Starting code serve-web" or "VSCode CLI (code) not found"
3. Visit `http://localhost:3000/api/vscode/status` — should return `{"available": true}` (or `false` if `code` not installed)
4. If `code` is installed and available: visit `http://localhost:3000/api/vscode/` — should show VSCode web UI
5. Start frontend: `cd apps/frontend && bun run dev`
6. Open chat, select a workspace, verify the Code icon appears in TitleBar
7. Click the icon — should open VSCode in a new tab showing the workspace
