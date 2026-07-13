---
name: dev-server
description: Use when user asks to start the dev server, run the app locally, or test changes in the browser
---

# Dev Server

## Prerequisites

Backend requires `apps/backend/.env`. If missing, copy from `.env.example`:

```bash
cp apps/backend/.env.example apps/backend/.env
```

## Start

Run from the repo root to start both frontend and backend:

```bash
pnpm dev
```

- Frontend: http://localhost:5173/
- Backend: http://localhost:3000/

## Notes

- The root `dev` script allocates free ports, then runs
  `pnpm --filter './apps/*' --parallel run dev` to start all apps in parallel.
- Frontend dev server (Vite) proxies API requests to the backend.
- Do not start frontend alone unless explicitly asked — always use the root command.
