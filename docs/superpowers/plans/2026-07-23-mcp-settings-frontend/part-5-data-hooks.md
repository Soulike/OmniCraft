# Part 5 — Data hooks (Tasks 11–13)

Back to [index](./README.md). All paths under `apps/frontend/src/pages/settings/sections/mcp/servers/hooks/`.

---

### Task 11: `useMcpStatus` — fetch + poll + reconnect

**Files:**

- Create: `hooks/useMcpStatus.ts`
- Create: `hooks/useMcpStatus.test.ts`

**Interfaces:**

- Consumes: `getMcpServers`, `reconnectMcpServer` (`@/api/mcp`); `McpServerStatusResponse` (`@omnicraft/api-schema`).
- Produces:

```ts
interface UseMcpStatus {
  statuses: McpServerStatusResponse[] | null;
  isLoading: boolean;
  loadError: boolean;
  reconnect: (name: string) => Promise<void>;
  refetch: () => Promise<void>;
}
function useMcpStatus(pollMs?: number): UseMcpStatus; // pollMs default 4000
```

Behavior: fetch on mount; poll every `pollMs` only while `document.visibilityState === 'visible'`; refetch immediately on `visibilitychange` → visible; `reconnect(name)` awaits the POST then refetches. A failed fetch sets `loadError` without throwing and keeps any previously loaded `statuses` (initial failure leaves `statuses` null).

- [ ] **Step 1: Write the failing tests**

Create `hooks/useMcpStatus.test.ts`:

```ts
import {act, renderHook, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {getMcpServers, reconnectMcpServer} from '@/api/mcp/index.js';

import {useMcpStatus} from './useMcpStatus.js';

vi.mock('@/api/mcp/index.js');

const mockedGet = vi.mocked(getMcpServers);
const mockedReconnect = vi.mocked(reconnectMcpServer);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useMcpStatus', () => {
  it('loads statuses on mount', async () => {
    mockedGet.mockResolvedValue([
      {name: 'fs', transportType: 'stdio', status: 'connected', tools: []},
    ]);

    const {result} = renderHook(() => useMcpStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.statuses).toHaveLength(1);
    expect(result.current.loadError).toBe(false);
  });

  it('sets loadError when the fetch fails and keeps statuses null', async () => {
    mockedGet.mockRejectedValue(new Error('down'));

    const {result} = renderHook(() => useMcpStatus());

    await waitFor(() => {
      expect(result.current.loadError).toBe(true);
    });
    expect(result.current.statuses).toBeNull();
  });

  it('reconnects then refetches', async () => {
    mockedGet.mockResolvedValue([]);
    mockedReconnect.mockResolvedValue(undefined);

    const {result} = renderHook(() => useMcpStatus());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    mockedGet.mockClear();

    await act(async () => {
      await result.current.reconnect('fs');
    });

    expect(mockedReconnect).toHaveBeenCalledWith('fs');
    expect(mockedGet).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/hooks/useMcpStatus.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `useMcpStatus.ts`**

Create `hooks/useMcpStatus.ts`:

```ts
import type {McpServerStatusResponse} from '@omnicraft/api-schema';
import {useCallback, useEffect, useState} from 'react';

import {getMcpServers, reconnectMcpServer} from '@/api/mcp/index.js';

const DEFAULT_POLL_MS = 4000;

export interface UseMcpStatus {
  statuses: McpServerStatusResponse[] | null;
  isLoading: boolean;
  loadError: boolean;
  reconnect: (name: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useMcpStatus(pollMs: number = DEFAULT_POLL_MS): UseMcpStatus {
  const [statuses, setStatuses] = useState<McpServerStatusResponse[] | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const next = await getMcpServers();
      setStatuses(next);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const initialLoad = async () => {
      await refetch();
      if (active) {
        setIsLoading(false);
      }
    };
    void initialLoad();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refetch();
      }
    }, pollMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refetch();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refetch, pollMs]);

  const reconnect = useCallback(
    async (name: string) => {
      await reconnectMcpServer(name);
      await refetch();
    },
    [refetch],
  );

  return {statuses, isLoading, loadError, reconnect, refetch};
}
```

- [ ] **Step 4: Run — green, commit**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/hooks/useMcpStatus.test.ts`
Expected: PASS (3 tests).

```bash
git add apps/frontend/src/pages/settings/sections/mcp/servers/hooks/useMcpStatus.ts apps/frontend/src/pages/settings/sections/mcp/servers/hooks/useMcpStatus.test.ts
git commit -m "feat(frontend): add useMcpStatus hook"
```

---

### Task 12: `useMcpConfig` — load + immediate-save mutations

**Files:**

- Create: `hooks/useMcpConfig.ts`
- Create: `hooks/useMcpConfig.test.ts`

**Interfaces:**

- Consumes: `getMcpConfig`, `putMcpConfig`, `McpConfig` (`@/api/settings/mcp`); `McpServer`, `AgentType` (`@omnicraft/settings-schema`).
- Produces:

```ts
interface UseMcpConfig {
  config: McpConfig;
  isLoading: boolean;
  loadError: boolean;
  isSaving: boolean;
  addServer: (server: McpServer) => Promise<boolean>;
  updateServer: (server: McpServer) => Promise<boolean>;
  removeServer: (name: string) => Promise<boolean>;
  setEnabled: (
    name: string,
    agentType: AgentType,
    enabled: boolean,
  ) => Promise<boolean>;
  reload: () => Promise<void>;
}
function useMcpConfig(): UseMcpConfig;
```

Each mutation writes the affected leaves via `putMcpConfig`, reloads config, and resolves `true` on success / `false` on failure (the caller toasts). `removeServer` also strips the name from both enablement arrays.

- [ ] **Step 1: Write the failing tests**

Create `hooks/useMcpConfig.test.ts`:

```ts
import {act, renderHook, waitFor} from '@testing-library/react';
import {
  AgentType,
  type McpServer,
  type McpTransport,
} from '@omnicraft/settings-schema';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {getMcpConfig, putMcpConfig} from '@/api/settings/mcp/index.js';

import {useMcpConfig} from './useMcpConfig.js';

vi.mock('@/api/settings/mcp/index.js');

const mockedGet = vi.mocked(getMcpConfig);
const mockedPut = vi.mocked(putMcpConfig);

const stdio: McpTransport = {type: 'stdio', command: 'npx', args: [], env: {}};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGet.mockResolvedValue({
    servers: [{name: 'fs', transport: stdio}],
    enabledChat: ['fs'],
    enabledCoding: [],
  });
  mockedPut.mockResolvedValue(undefined);
});

async function mountLoaded() {
  const hook = renderHook(() => useMcpConfig());
  await waitFor(() => {
    expect(hook.result.current.isLoading).toBe(false);
  });
  return hook;
}

describe('useMcpConfig', () => {
  it('loads config on mount', async () => {
    const {result} = await mountLoaded();
    expect(result.current.config.servers).toHaveLength(1);
    expect(result.current.config.enabledChat).toEqual(['fs']);
  });

  it('appends a server on add', async () => {
    const {result} = await mountLoaded();
    await act(async () => {
      await result.current.addServer({name: 'two', transport: stdio});
    });
    expect(mockedPut).toHaveBeenCalledWith({
      servers: [
        {name: 'fs', transport: stdio},
        {name: 'two', transport: stdio},
      ],
    });
  });

  it('replaces the matching server on update', async () => {
    const {result} = await mountLoaded();
    const updated: McpServer = {
      name: 'fs',
      transport: {type: 'stdio', command: 'node', args: [], env: {}},
    };
    await act(async () => {
      await result.current.updateServer(updated);
    });
    expect(mockedPut).toHaveBeenCalledWith({servers: [updated]});
  });

  it('strips the name from servers and both arrays on remove', async () => {
    const {result} = await mountLoaded();
    await act(async () => {
      await result.current.removeServer('fs');
    });
    expect(mockedPut).toHaveBeenCalledWith({
      servers: [],
      enabledChat: [],
      enabledCoding: [],
    });
  });

  it('adds a name to the coding array on enable', async () => {
    const {result} = await mountLoaded();
    await act(async () => {
      await result.current.setEnabled('fs', AgentType.CODING, true);
    });
    expect(mockedPut).toHaveBeenCalledWith({enabledCoding: ['fs']});
  });

  it('removes a name from the chat array on disable', async () => {
    const {result} = await mountLoaded();
    await act(async () => {
      await result.current.setEnabled('fs', AgentType.CHAT, false);
    });
    expect(mockedPut).toHaveBeenCalledWith({enabledChat: []});
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/hooks/useMcpConfig.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `useMcpConfig.ts`**

Create `hooks/useMcpConfig.ts`:

```ts
import {
  getMcpConfig,
  type McpConfig,
  type McpConfigUpdate,
  putMcpConfig,
} from '@/api/settings/mcp/index.js';
import {AgentType, type McpServer} from '@omnicraft/settings-schema';
import {useCallback, useEffect, useState} from 'react';

const EMPTY_CONFIG: McpConfig = {
  servers: [],
  enabledChat: [],
  enabledCoding: [],
};

export interface UseMcpConfig {
  config: McpConfig;
  isLoading: boolean;
  loadError: boolean;
  isSaving: boolean;
  addServer: (server: McpServer) => Promise<boolean>;
  updateServer: (server: McpServer) => Promise<boolean>;
  removeServer: (name: string) => Promise<boolean>;
  setEnabled: (
    name: string,
    agentType: AgentType,
    enabled: boolean,
  ) => Promise<boolean>;
  reload: () => Promise<void>;
}

export function useMcpConfig(): UseMcpConfig {
  const [config, setConfig] = useState<McpConfig>(EMPTY_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setConfig(await getMcpConfig());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      setIsLoading(false);
    })();
  }, [load]);

  const save = useCallback(
    async (update: McpConfigUpdate): Promise<boolean> => {
      setIsSaving(true);
      try {
        await putMcpConfig(update);
        await load();
        return true;
      } catch {
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [load],
  );

  const addServer = useCallback(
    (server: McpServer) => save({servers: [...config.servers, server]}),
    [config.servers, save],
  );

  const updateServer = useCallback(
    (server: McpServer) =>
      save({
        servers: config.servers.map((existing) =>
          existing.name === server.name ? server : existing,
        ),
      }),
    [config.servers, save],
  );

  const removeServer = useCallback(
    (name: string) =>
      save({
        servers: config.servers.filter((server) => server.name !== name),
        enabledChat: config.enabledChat.filter((n) => n !== name),
        enabledCoding: config.enabledCoding.filter((n) => n !== name),
      }),
    [config, save],
  );

  const setEnabled = useCallback(
    (name: string, agentType: AgentType, enabled: boolean) => {
      if (agentType === AgentType.CHAT) {
        const next = enabled
          ? Array.from(new Set([...config.enabledChat, name]))
          : config.enabledChat.filter((n) => n !== name);
        return save({enabledChat: next});
      }
      const next = enabled
        ? Array.from(new Set([...config.enabledCoding, name]))
        : config.enabledCoding.filter((n) => n !== name);
      return save({enabledCoding: next});
    },
    [config, save],
  );

  return {
    config,
    isLoading,
    loadError,
    isSaving,
    addServer,
    updateServer,
    removeServer,
    setEnabled,
    reload: load,
  };
}
```

- [ ] **Step 4: Run — green, commit**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/hooks/useMcpConfig.test.ts`
Expected: PASS (6 tests).

```bash
git add apps/frontend/src/pages/settings/sections/mcp/servers/hooks/useMcpConfig.ts apps/frontend/src/pages/settings/sections/mcp/servers/hooks/useMcpConfig.test.ts
git commit -m "feat(frontend): add useMcpConfig hook"
```

---

### Task 13: `useServerFormModal` — modal open state

Tracks whether the add/edit modal is open, its mode, its edit target, and an `instanceId` that increments on **every** open so the section can remount the form (fresh field state) via a React `key`.

**Files:**

- Create: `hooks/useServerFormModal.ts`
- Create: `hooks/useServerFormModal.test.ts`

**Interfaces:**

- Consumes: `McpServer` (`@omnicraft/settings-schema`).
- Produces:

```ts
interface UseServerFormModal {
  isOpen: boolean;
  mode: 'add' | 'edit';
  target?: McpServer;
  instanceId: number;
  openAdd: () => void;
  openEdit: (server: McpServer) => void;
  close: () => void;
}
function useServerFormModal(): UseServerFormModal;
```

- [ ] **Step 1: Write the failing tests**

Create `hooks/useServerFormModal.test.ts`:

```ts
import type {McpServer} from '@omnicraft/settings-schema';
import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {useServerFormModal} from './useServerFormModal.js';

const server: McpServer = {
  name: 'fs',
  transport: {type: 'stdio', command: 'npx', args: [], env: {}},
};

describe('useServerFormModal', () => {
  it('starts closed in add mode', () => {
    const {result} = renderHook(() => useServerFormModal());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.mode).toBe('add');
  });

  it('opens for add with no target and bumps instanceId', () => {
    const {result} = renderHook(() => useServerFormModal());
    const before = result.current.instanceId;
    act(() => {
      result.current.openAdd();
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.mode).toBe('add');
    expect(result.current.target).toBeUndefined();
    expect(result.current.instanceId).toBe(before + 1);
  });

  it('opens for edit with the target server', () => {
    const {result} = renderHook(() => useServerFormModal());
    act(() => {
      result.current.openEdit(server);
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.mode).toBe('edit');
    expect(result.current.target).toEqual(server);
  });

  it('closes', () => {
    const {result} = renderHook(() => useServerFormModal());
    act(() => {
      result.current.openAdd();
    });
    act(() => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('bumps instanceId on each open', () => {
    const {result} = renderHook(() => useServerFormModal());
    act(() => {
      result.current.openAdd();
    });
    const first = result.current.instanceId;
    act(() => {
      result.current.openAdd();
    });
    expect(result.current.instanceId).toBe(first + 1);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/hooks/useServerFormModal.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `useServerFormModal.ts`**

Create `hooks/useServerFormModal.ts`:

```ts
import type {McpServer} from '@omnicraft/settings-schema';
import {useCallback, useState} from 'react';

export interface UseServerFormModal {
  isOpen: boolean;
  mode: 'add' | 'edit';
  target?: McpServer;
  instanceId: number;
  openAdd: () => void;
  openEdit: (server: McpServer) => void;
  close: () => void;
}

interface ModalState {
  isOpen: boolean;
  mode: 'add' | 'edit';
  target?: McpServer;
  instanceId: number;
}

export function useServerFormModal(): UseServerFormModal {
  const [state, setState] = useState<ModalState>({
    isOpen: false,
    mode: 'add',
    instanceId: 0,
  });

  const openAdd = useCallback(() => {
    setState((prev) => ({
      isOpen: true,
      mode: 'add',
      target: undefined,
      instanceId: prev.instanceId + 1,
    }));
  }, []);

  const openEdit = useCallback((server: McpServer) => {
    setState((prev) => ({
      isOpen: true,
      mode: 'edit',
      target: server,
      instanceId: prev.instanceId + 1,
    }));
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({...prev, isOpen: false}));
  }, []);

  return {...state, openAdd, openEdit, close};
}
```

- [ ] **Step 4: Run — green, commit**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/hooks/useServerFormModal.test.ts`
Expected: PASS (5 tests).

```bash
git add apps/frontend/src/pages/settings/sections/mcp/servers/hooks/useServerFormModal.ts apps/frontend/src/pages/settings/sections/mcp/servers/hooks/useServerFormModal.test.ts
git commit -m "feat(frontend): add useServerFormModal hook"
```

---

Next: [Part 6 — section + wiring](./part-6-section-and-wiring.md)
