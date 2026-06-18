# Parallel-Safe Dev Servers

## Problem

Multiple agents may run the dev stack in parallel. Vite already self-selects a
free port when its default is taken, but the backend does not: it reads `PORT`
(and `VSCODE_PORT`) from `.env` and fails fast when the port is occupied. A
second concurrent `dev` run therefore crashes the backend on the HTTP port, and
`code serve-web` collides on the VSCode port.

A naive fix — letting the backend pick its own free port — breaks the frontend.
Vite's proxy target is hardcoded to `http://localhost:3000` (`vite.config.ts`),
and the Vite process is separate from the backend process. If each process
independently "increments until free", they race and never agree on the same
port. Coordination requires a single decider.

## Goals

- Two or more full dev stacks (frontend + backend + `code serve-web`) can run
  simultaneously without manual `.env` editing.
- The frontend always proxies `/api` to its own backend, never another agent's.
- Production (`start`) is unchanged and still fails fast on a taken port.

## Non-Goals

- No change to how production selects ports. `.env` remains the source of truth
  there.
- No predictable/stable dev ports. In dev, ports are OS-assigned and random by
  design (per user decision).

## Approach

A single root launcher process picks the ports and hands the same values to both
the frontend and backend via injected environment variables. One decider
eliminates the race.

### Components

1. **`scripts/dev.ts`** (new, repo root) — run by the root `dev` script:
   - Obtains two free ports from the OS by binding a throwaway server to port
     `0`, reading the assigned port, then closing it. One port for the backend
     HTTP server, one for `code serve-web`.
   - Spawns the frontend (Vite) and backend dev processes, injecting `PORT` and
     `VSCODE_PORT` into their environment.
   - Inherits/forwards stdio so both servers' logs appear as today.
   - On exit (including Ctrl-C), tears down both child processes.

2. **`vite.config.ts`** (one-line change) — proxy target reads
   `process.env.PORT`, falling back to `3000` if run standalone:

   ```ts
   proxy: {
     '/api': `http://localhost:${process.env.PORT ?? '3000'}`,
   }
   ```

3. **Backend** — no code change. It already reads `PORT` and `VSCODE_PORT` from
   env via `assert` and fails fast when missing. In dev these arrive from the
   launcher; in production they come from `.env` exactly as now.

4. **Root `package.json`** — the `dev` script changes from
   `bun run --filter './apps/*' dev` to running `scripts/dev.ts` via `bun`.

### Data flow

```
scripts/dev.ts
  ├─ pick free HTTP port  ─┐
  ├─ pick free VSCODE port ┤ inject as env
  ├─ spawn Vite      (PORT, VSCODE_PORT) ──> proxy /api ─> localhost:$PORT
  └─ spawn backend   (PORT, VSCODE_PORT) ──> listen $PORT, code serve-web $VSCODE_PORT
```

The developer opens the URL Vite prints (Vite manages its own dev port). The
random backend port is invisible to them.

## Free-port helper

A small pure-ish function — e.g. `getFreePort(): Promise<number>` — that:

- Creates a `node:net` server, listens on port `0` on localhost.
- Reads `server.address().port`.
- Closes the server and resolves the port.

Called twice (sequentially, so the two ports are distinct) for HTTP and VSCode.

Per project convention, use Node APIs (`node:net`), not Bun-specific APIs.

## Error handling

- If a child process exits non-zero, the launcher logs and propagates a
  non-zero exit so the failure is visible.
- On launcher termination (SIGINT/SIGTERM), kill both children before exiting to
  avoid orphaned servers holding ports.

## Testing

- **Unit:** `getFreePort` returns a positive port, and two sequential calls
  return distinct ports that are actually bindable.
- **Manual integration:** run two `dev` instances; confirm both stacks come up
  on different ports and each frontend's `/api` proxy reaches its own backend.
  The launcher's spawn/teardown is integration-level and verified by hand.

## What is untouched

- Production `start`.
- `.env` / `.env.example` files and fail-fast behavior outside dev.
- VSCODE_PORT shifts symmetrically with PORT.
