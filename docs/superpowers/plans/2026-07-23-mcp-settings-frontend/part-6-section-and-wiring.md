# Part 6 — Section + wiring (Tasks 14–15)

Back to [index](./README.md).

---

### Task 14: `McpServersSection` container + view

The composition point: combines `useMcpConfig`, `useMcpStatus`, `useServerFormModal`, merges config+status into rows, and wires mutation handlers (each toasts and refetches status). The container holds no state of its own.

**Files (all under `apps/frontend/src/pages/settings/sections/mcp/servers/`):**

- Create: `McpServersSection.tsx` (container)
- Create: `McpServersSectionView.tsx` (stateless view)
- Create: `index.ts`
- Create: `styles.module.css`
- Create: `McpServersSection.test.tsx`

**Interfaces:**

- Consumes: `useMcpConfig`, `useMcpStatus`, `useServerFormModal`, `mergeServers`, `McpServerRow`, `ServerList`, `ServerFormModal`, `UseServerFormModal`; `toast`, `Button`, `Skeleton` (`@heroui/react`); `LoadError` (`@/components/LoadError`); `AgentType`, `McpServer` (`@omnicraft/settings-schema`).
- Produces: `McpServersSection()` — the page section, exported from `index.ts` with a plain named export (page-component convention).

- [ ] **Step 1: Write the failing container test**

Create `McpServersSection.test.tsx`:

```tsx
import type {McpTransport} from '@omnicraft/settings-schema';
import {fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {getMcpServers, reconnectMcpServer} from '@/api/mcp/index.js';
import {getMcpConfig, putMcpConfig} from '@/api/settings/mcp/index.js';

import {McpServersSection} from './index.js';

vi.mock('@/api/mcp/index.js');
vi.mock('@/api/settings/mcp/index.js');

const stdio: McpTransport = {type: 'stdio', command: 'npx', args: [], env: {}};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMcpConfig).mockResolvedValue({
    servers: [{name: 'fs', transport: stdio}],
    enabledChat: ['fs'],
    enabledCoding: [],
  });
  vi.mocked(putMcpConfig).mockResolvedValue(undefined);
  vi.mocked(getMcpServers).mockResolvedValue([
    {name: 'fs', transportType: 'stdio', status: 'connected', tools: []},
  ]);
  vi.mocked(reconnectMcpServer).mockResolvedValue(undefined);
});

describe('McpServersSection', () => {
  it('renders configured servers after loading', async () => {
    render(<McpServersSection />);
    expect(await screen.findByText('fs')).toBeInTheDocument();
    expect(screen.getByText('connected')).toBeInTheDocument();
  });

  it('opens the add modal', async () => {
    render(<McpServersSection />);
    await screen.findByText('fs');
    fireEvent.click(screen.getByRole('button', {name: 'Add server'}));
    expect(await screen.findByText('Add MCP server')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/McpServersSection.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the container**

Create `McpServersSection.tsx`:

```tsx
import {toast} from '@heroui/react';
import type {AgentType, McpServer} from '@omnicraft/settings-schema';
import {useCallback, useMemo} from 'react';

import {mergeServers} from './helpers/merge-servers.js';
import {useMcpConfig} from './hooks/useMcpConfig.js';
import {useMcpStatus} from './hooks/useMcpStatus.js';
import {useServerFormModal} from './hooks/useServerFormModal.js';
import {McpServersSectionView} from './McpServersSectionView.js';

export function McpServersSection() {
  const config = useMcpConfig();
  const status = useMcpStatus();
  const modal = useServerFormModal();

  const rows = mergeServers(config.config, status.statuses);

  const existingNames = useMemo(() => {
    const names = config.config.servers.map((server) => server.name);
    if (modal.mode === 'edit' && modal.target) {
      const editedName = modal.target.name;
      return names.filter((name) => name !== editedName);
    }
    return names;
  }, [config.config.servers, modal.mode, modal.target]);

  const handleSubmit = useCallback(
    async (server: McpServer) => {
      const ok =
        modal.mode === 'edit'
          ? await config.updateServer(server)
          : await config.addServer(server);
      if (ok) {
        toast.success(
          modal.mode === 'edit' ? 'Server updated' : 'Server added',
        );
        modal.close();
        void status.refetch();
      } else {
        toast.danger('Failed to save server');
      }
    },
    [modal, config, status],
  );

  const handleToggle = useCallback(
    async (name: string, agentType: AgentType, enabled: boolean) => {
      const ok = await config.setEnabled(name, agentType, enabled);
      if (ok) {
        void status.refetch();
      } else {
        toast.danger('Failed to update enablement');
      }
    },
    [config, status],
  );

  const handleRemove = useCallback(
    async (name: string) => {
      const ok = await config.removeServer(name);
      if (ok) {
        toast.success('Server removed');
        void status.refetch();
      } else {
        toast.danger('Failed to remove server');
      }
    },
    [config, status],
  );

  const handleReconnect = useCallback(
    async (name: string) => {
      try {
        await status.reconnect(name);
      } catch {
        toast.danger('Failed to reconnect');
      }
    },
    [status],
  );

  const handleEdit = useCallback(
    (name: string) => {
      const server = config.config.servers.find((s) => s.name === name);
      if (server) {
        modal.openEdit(server);
      }
    },
    [config.config.servers, modal],
  );

  return (
    <McpServersSectionView
      isLoading={config.isLoading}
      loadError={config.loadError}
      statusUnavailable={status.loadError}
      isSaving={config.isSaving}
      rows={rows}
      modal={modal}
      existingNames={existingNames}
      onAddClick={modal.openAdd}
      onReload={() => {
        void config.reload();
      }}
      onSubmitServer={(server) => {
        void handleSubmit(server);
      }}
      onToggle={(name, agentType, enabled) => {
        void handleToggle(name, agentType, enabled);
      }}
      onEdit={handleEdit}
      onRemove={(name) => {
        void handleRemove(name);
      }}
      onReconnect={(name) => {
        void handleReconnect(name);
      }}
    />
  );
}
```

- [ ] **Step 4: Implement the view**

Create `McpServersSectionView.tsx`:

```tsx
import {Button, Skeleton} from '@heroui/react';
import type {AgentType, McpServer} from '@omnicraft/settings-schema';

import {LoadError} from '@/components/LoadError/index.js';

import {ServerFormModal} from './components/ServerFormModal/index.js';
import {ServerList} from './components/ServerList/index.js';
import type {McpServerRow} from './helpers/merge-servers.js';
import type {UseServerFormModal} from './hooks/useServerFormModal.js';
import styles from './styles.module.css';

interface McpServersSectionViewProps {
  isLoading: boolean;
  loadError: boolean;
  statusUnavailable: boolean;
  isSaving: boolean;
  rows: McpServerRow[];
  modal: UseServerFormModal;
  existingNames: string[];
  onAddClick: () => void;
  onReload: () => void;
  onSubmitServer: (server: McpServer) => void;
  onToggle: (name: string, agentType: AgentType, enabled: boolean) => void;
  onEdit: (name: string) => void;
  onRemove: (name: string) => void;
  onReconnect: (name: string) => void;
}

export function McpServersSectionView({
  isLoading,
  loadError,
  statusUnavailable,
  isSaving,
  rows,
  modal,
  existingNames,
  onAddClick,
  onReload,
  onSubmitServer,
  onToggle,
  onEdit,
  onRemove,
  onReconnect,
}: McpServersSectionViewProps) {
  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>MCP Servers</h2>
          <p className={styles.subtitle}>
            Connect external Model Context Protocol tool servers and choose
            which agents may use each one.
          </p>
        </div>
        <Button
          variant='primary'
          isDisabled={isLoading || isSaving}
          onPress={onAddClick}
        >
          Add server
        </Button>
      </div>

      {loadError ? (
        <LoadError message='Failed to load MCP settings.' onRetry={onReload} />
      ) : isLoading ? (
        <div className={styles.skeletons}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className={styles.skeletonRow} />
          ))}
        </div>
      ) : (
        <>
          {statusUnavailable && (
            <p className={styles.statusNote}>
              Live status is unavailable. Showing your saved configuration.
            </p>
          )}
          <ServerList
            rows={rows}
            isSaving={isSaving}
            onToggle={onToggle}
            onEdit={onEdit}
            onRemove={onRemove}
            onReconnect={onReconnect}
          />
        </>
      )}

      <ServerFormModal
        key={modal.instanceId}
        isOpen={modal.isOpen}
        mode={modal.mode}
        initial={modal.target}
        existingNames={existingNames}
        isSaving={isSaving}
        onSubmit={onSubmitServer}
        onClose={modal.close}
      />
    </div>
  );
}
```

Create `index.ts` (page-component convention — plain named export):

```ts
export {McpServersSection} from './McpServersSection.js';
```

Create `styles.module.css`:

```css
.section {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 100%;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.title {
  font-size: 20px;
  font-weight: 600;
  color: var(--foreground);
}

.subtitle {
  margin-top: 4px;
  font-size: 14px;
  color: var(--foreground);
  opacity: 0.7;
  max-width: 52ch;
}

.skeletons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeletonRow {
  height: 96px;
  border-radius: 8px;
}

.statusNote {
  font-size: 13px;
  color: var(--foreground);
  opacity: 0.7;
}
```

- [ ] **Step 5: Run — green**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/McpServersSection.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/settings/sections/mcp/servers/McpServersSection.tsx apps/frontend/src/pages/settings/sections/mcp/servers/McpServersSectionView.tsx apps/frontend/src/pages/settings/sections/mcp/servers/index.ts apps/frontend/src/pages/settings/sections/mcp/servers/styles.module.css apps/frontend/src/pages/settings/sections/mcp/servers/McpServersSection.test.tsx
git commit -m "feat(frontend): assemble McpServersSection page section"
```

---

### Task 15: Routing + navigation wiring

Registers the section as a route and a settings nav item. Nothing renders it until this task.

**Files:**

- Modify: `apps/frontend/src/routes.ts`
- Modify: `apps/frontend/src/routes.test.ts`
- Modify: `apps/frontend/src/pages/settings/SettingsPage.tsx`
- Modify: `apps/frontend/src/router/lazy-pages.tsx`
- Modify: `apps/frontend/src/router/router.tsx`

- [ ] **Step 1: Write the failing route test**

In `apps/frontend/src/routes.test.ts`, add a case inside the `describe('settings routes', …)` block:

```ts
it('nests Servers under /settings/mcp', () => {
  expect(ROUTES.settings.mcp.servers()).toBe('/settings/mcp/servers');
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm --filter @omnicraft/frontend test -- src/routes.test.ts`
Expected: FAIL — `ROUTES.settings.mcp` is `undefined` (TypeScript error / runtime throw).

- [ ] **Step 3: Add the route definition**

In `apps/frontend/src/routes.ts`, add `mcp` to the `settings` block:

```ts
  settings: {
    llm: {chat: {}},
    coding: {agent: {}, workspaces: {}},
    agent: {runtime: {}},
    tools: {search: {}},
    mcp: {servers: {}},
  },
```

- [ ] **Step 4: Run — green**

Run: `pnpm --filter @omnicraft/frontend test -- src/routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the lazy page**

In `apps/frontend/src/router/lazy-pages.tsx`, append:

```tsx
export const McpServersSection = lazy(async () => {
  const {McpServersSection} =
    await import('@/pages/settings/sections/mcp/servers/index.js');
  return {default: McpServersSection};
});
```

- [ ] **Step 6: Register the route**

In `apps/frontend/src/router/router.tsx`, add `McpServersSection` to the import from `./lazy-pages.js`, then add a child route inside the settings `children` array (after the tools/search route):

```tsx
          {
            path: ROUTES.settings.mcp.servers(),
            element: <McpServersSection />,
          },
```

- [ ] **Step 7: Add the nav item**

In `apps/frontend/src/pages/settings/SettingsPage.tsx`, append a new group to `SETTINGS_NAV_ITEMS` (after the `tools` group):

```tsx
  {
    id: 'mcp',
    label: 'MCP',
    children: [
      {
        id: 'mcp.servers',
        label: 'Servers',
        path: ROUTES.settings.mcp.servers(),
      },
    ],
  },
```

- [ ] **Step 8: Run the full frontend suite + typecheck**

Run: `pnpm --filter @omnicraft/frontend test`
Expected: PASS (all suites, including the new MCP tests).

Run: `pnpm --filter @omnicraft/frontend run typecheck` (script is `tsc -b`).
Expected: no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/routes.ts apps/frontend/src/routes.test.ts apps/frontend/src/router/lazy-pages.tsx apps/frontend/src/router/router.tsx apps/frontend/src/pages/settings/SettingsPage.tsx
git commit -m "feat(frontend): wire MCP Servers settings route and nav"
```

---

Next: [Part 7 — verification](./part-7-verification.md)
