# Parallel-Safe Dev Servers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let multiple agents run the full dev stack in parallel by having a single root launcher pick free ports and inject them into both the frontend and backend.

**Architecture:** A new root `scripts/dev.ts` launcher obtains free ports from the OS, then spawns the existing `bun run --filter './apps/*' dev` command with `PORT` and `VSCODE_PORT` injected into its environment. Both apps inherit these vars (Bun gives pre-set env precedence over `.env`), so the backend listens on the chosen port and Vite's proxy targets the same port. Production is untouched.

**Tech Stack:** Bun (runtime + package manager), Node APIs (`node:net`, `node:child_process`), Vite, Vitest.

---

## File Structure

- **Create** `scripts/free-ports.ts` — `getFreePorts(count)` helper that returns N distinct, free ports using `node:net`.
- **Create** `scripts/free-ports.test.ts` — unit tests for the helper.
- **Create** `scripts/dev.ts` — the launcher: pick ports, spawn the app dev processes with injected env, forward signals, propagate exit code.
- **Create** `vitest.config.ts` (repo root) — scopes a root Vitest run to `scripts/**` only.
- **Modify** `package.json` (repo root) — change `dev` script to run the launcher; add a `test` script for the scripts tests.
- **Modify** `apps/frontend/vite.config.ts` — proxy target reads `process.env.PORT`.

### Why `getFreePorts(count)` instead of calling a single-port helper twice

If a helper binds to port `0`, reads the assigned port, then closes the socket before returning, two sequential calls can return the **same** port (the OS is free to reuse the just-released port). The backend HTTP server and `code serve-web` would then collide. `getFreePorts` opens all `count` listeners **simultaneously**, so the OS is forced to hand out distinct ports; it reads them, then closes all sockets. The tiny race between closing and the real servers binding is accepted (two agents starting at the exact same instant is vanishingly unlikely).

---

## Task 1: Root test infrastructure for `scripts/`

`scripts/` is not a workspace, so no Vitest config currently covers it. Add a root config scoped to `scripts/**` and a root `test` script so the helper in Task 2 has a test home. Vitest is already a root devDependency.

**Files:**

- Create: `vitest.config.ts`
- Modify: `package.json` (root, scripts block)

- [ ] **Step 1: Create the root Vitest config**

Create `vitest.config.ts`:

```ts
import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Add a root `test` script**

In root `package.json`, the `scripts` block currently is:

```json
  "scripts": {
    "prepare": "test -d node_modules/husky && husky",
    "format": "prettier --write --ignore-unknown .",
    "format:check": "prettier --check --ignore-unknown .",
    "dev": "bun run --filter './apps/*' dev",
    "build:frontend": "bun run --filter '@omnicraft/frontend' build",
    "start": "bun run build:frontend && bun run --filter '@omnicraft/backend' start"
  },
```

Add a `test` line (leave `dev` unchanged for now — Task 4 changes it):

```json
  "scripts": {
    "prepare": "test -d node_modules/husky && husky",
    "format": "prettier --write --ignore-unknown .",
    "format:check": "prettier --check --ignore-unknown .",
    "test": "vitest run",
    "dev": "bun run --filter './apps/*' dev",
    "build:frontend": "bun run --filter '@omnicraft/frontend' build",
    "start": "bun run build:frontend && bun run --filter '@omnicraft/backend' start"
  },
```

- [ ] **Step 3: Verify Vitest runs (and finds no tests yet)**

Run: `bun run test`
Expected: Vitest starts and reports "No test files found, exiting with code 0" (or a passing run with 0 tests). It must NOT pick up `apps/**` tests.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "chore: add root vitest config scoped to scripts"
```

---

## Task 2: `getFreePorts` helper (TDD)

**Files:**

- Create: `scripts/free-ports.ts`
- Test: `scripts/free-ports.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/free-ports.test.ts`:

```ts
import net from 'node:net';

import {describe, expect, it} from 'vitest';

import {getFreePorts} from './free-ports';

function canBind(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve());
    });
  });
}

describe('getFreePorts', () => {
  it('returns the requested number of ports', async () => {
    const ports = await getFreePorts(2);
    expect(ports).toHaveLength(2);
  });

  it('returns positive port numbers', async () => {
    const ports = await getFreePorts(3);
    for (const port of ports) {
      expect(port).toBeGreaterThan(0);
    }
  });

  it('returns distinct ports', async () => {
    const ports = await getFreePorts(5);
    expect(new Set(ports).size).toBe(ports.length);
  });

  it('returns ports that can be bound', async () => {
    const [port] = await getFreePorts(1);
    await expect(canBind(port)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test`
Expected: FAIL — cannot resolve `./free-ports` / `getFreePorts is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/free-ports.ts`:

```ts
import net from 'node:net';

interface HeldPort {
  port: number;
  server: net.Server;
}

function listenOnFreePort(): Promise<HeldPort> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to read assigned port'));
        return;
      }
      resolve({port: address.port, server});
    });
  });
}

function close(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

/**
 * Returns `count` distinct, currently-free TCP ports. All listeners are opened
 * simultaneously so the OS is forced to assign different ports, then released.
 */
export async function getFreePorts(count: number): Promise<number[]> {
  const held = await Promise.all(
    Array.from({length: count}, () => listenOnFreePort()),
  );
  const ports = held.map(({port}) => port);
  await Promise.all(held.map(({server}) => close(server)));
  return ports;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add scripts/free-ports.ts scripts/free-ports.test.ts
git commit -m "feat: add getFreePorts helper for dev port selection"
```

---

## Task 3: Dev launcher

**Files:**

- Create: `scripts/dev.ts`

This is dev tooling (a root CLI script), so `console` logging is appropriate here — the backend's no-`console` rule is scoped to `apps/backend/src`.

- [ ] **Step 1: Write the launcher**

Create `scripts/dev.ts`:

```ts
import {spawn} from 'node:child_process';

import {getFreePorts} from './free-ports';

const [httpPort, vscodePort] = await getFreePorts(2);

console.log(`Dev ports: PORT=${httpPort}, VSCODE_PORT=${vscodePort}`);

const child = spawn('bun', ['run', '--filter', './apps/*', 'dev'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(httpPort),
    VSCODE_PORT: String(vscodePort),
  },
});

child.on('error', (error) => {
  console.error('Failed to start dev processes:', error);
  process.exit(1);
});

const forward = (signal: NodeJS.Signals) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
```

- [ ] **Step 2: Smoke-test the launcher boots**

Run: `bun scripts/dev.ts`
Expected: prints a `Dev ports: PORT=<n>, VSCODE_PORT=<m>` line with two different numbers, then the usual frontend + backend dev output appears (Vite prints its URL; backend logs `Server is listening on port <n>`). Stop it with Ctrl-C and confirm both processes terminate (no orphaned process still holding the port — `lsof -i :<n>` returns nothing).

- [ ] **Step 3: Commit**

```bash
git add scripts/dev.ts
git commit -m "feat: add dev launcher that injects free ports"
```

---

## Task 4: Wire the root `dev` script to the launcher

**Files:**

- Modify: `package.json` (root, `dev` line)

- [ ] **Step 1: Point `dev` at the launcher**

In root `package.json`, change:

```json
    "dev": "bun run --filter './apps/*' dev",
```

to:

```json
    "dev": "bun scripts/dev.ts",
```

- [ ] **Step 2: Verify `bun run dev` works through the script**

Run: `bun run dev`
Expected: same successful boot as Task 3 Step 2 (port line, then both servers). Stop with Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: run dev stack through the port-injecting launcher"
```

---

## Task 5: Frontend proxy reads the injected port

**Files:**

- Modify: `apps/frontend/vite.config.ts` (the `server.proxy` block)

- [ ] **Step 1: Make the proxy target dynamic**

In `apps/frontend/vite.config.ts`, the current block is:

```ts
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
```

Change it to:

```ts
  server: {
    proxy: {
      '/api': `http://localhost:${process.env.PORT ?? '3000'}`,
    },
  },
```

- [ ] **Step 2: Verify the proxy hits the chosen backend**

Run: `bun run dev`
Note the `PORT=<n>` printed by the launcher. Once both servers are up, open the URL Vite prints in a browser and confirm the app loads and an `/api` request succeeds (the app fetches data without proxy errors in the Vite terminal). The backend log line should show the same `<n>`.

Then confirm parallel safety: in a **second** terminal, run `bun run dev` again. Confirm it prints a **different** `PORT`/`VSCODE_PORT`, both stacks stay up, and each browser tab's `/api` calls succeed against its own backend (no `ECONNREFUSED`/proxy errors in either Vite terminal).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/vite.config.ts
git commit -m "feat: point vite dev proxy at the injected backend port"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run the scripts test suite**

Run: `bun run test`
Expected: PASS — `getFreePorts` tests green.

- [ ] **Step 2: Run format check**

Run: `bun run format:check`
Expected: PASS (all new files already Prettier-clean).

- [ ] **Step 3: Confirm production path is untouched**

Visually confirm root `package.json` `start` still reads `bun run build:frontend && bun run --filter '@omnicraft/backend' start`, and `apps/backend/src/index.ts` still asserts `PORT` from env (fail-fast). No code in `apps/backend` was changed by this plan.

---

## Self-Review Notes

- **Spec coverage:** launcher (`scripts/dev.ts`) ✓; free-port helper with test ✓; `vite.config.ts` one-line proxy change ✓; backend untouched ✓; root `dev` script rewired ✓; production/`.env`/fail-fast untouched ✓; VSCODE_PORT shifts symmetrically (injected alongside PORT) ✓.
- **Deviation from spec (intentional):** spec described calling a single-port helper twice sequentially; replaced with `getFreePorts(count)` opening listeners simultaneously to guarantee the two ports are distinct. Rationale documented in the File Structure section.
- **Type consistency:** helper exported as `getFreePorts` and imported under that exact name in both `dev.ts` and the test. Import specifier is extensionless `./free-ports` (resolved by both Bun and Vitest); `scripts/` has no nodenext tsconfig requiring `.js` extensions.
- **No placeholders:** every code and command step is complete.
