# Part 1 — Schema packages + Frontend API (Tasks 1–3)

Back to [index](./README.md). Read **Global Constraints** and **Shared types** in the index before starting.

---

### Task 1: Schema packages — trim status enum + export server schema

Two small, independent package edits, committed together as the schema prerequisite for the frontend.

**Files:**

- Modify: `packages/api-schema/src/mcp/schema.ts` (status enum)
- Create: `packages/api-schema/src/mcp/schema.test.ts`
- Modify: `packages/settings-schema/src/mcp/schema.ts` (add `export` to two consts)
- Modify: `packages/settings-schema/src/index.ts` (re-export)
- Modify: `packages/settings-schema/src/mcp/schema.test.ts` (export-validation cases)

**Interfaces:**

- Produces: `mcpServerSchema`, `mcpTransportSchema` (Zod values) exported from `@omnicraft/settings-schema`; `mcpServerStatusSchema.status` limited to `'connecting' | 'connected' | 'error'`.

- [ ] **Step 1: Write the failing api-schema test**

Create `packages/api-schema/src/mcp/schema.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {mcpServerStatusSchema} from './schema.js';

describe('mcpServerStatusSchema', () => {
  it('accepts the live connection statuses', () => {
    for (const status of ['connecting', 'connected', 'error'] as const) {
      const result = mcpServerStatusSchema.safeParse({
        name: 'fs',
        transportType: 'stdio',
        status,
        tools: [],
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects the removed 'disabled' status", () => {
    const result = mcpServerStatusSchema.safeParse({
      name: 'fs',
      transportType: 'stdio',
      status: 'disabled',
      tools: [],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — the `disabled` case fails**

Run: `pnpm --filter @omnicraft/api-schema test`
Expected: FAIL — `rejects the removed 'disabled' status` expects `success` to be `false`, but `'disabled'` is still in the enum so it parses.

- [ ] **Step 3: Trim the enum**

In `packages/api-schema/src/mcp/schema.ts`, change the status field:

```ts
  status: z.enum(['connecting', 'connected', 'error']),
```

- [ ] **Step 4: Run it — green**

Run: `pnpm --filter @omnicraft/api-schema test`
Expected: PASS.

- [ ] **Step 5: Write the failing settings-schema export test**

Append to `packages/settings-schema/src/mcp/schema.test.ts` (add the import at top):

```ts
import {mcpServerSchema} from '../index.js';
```

```ts
describe('mcpServerSchema (package export)', () => {
  it('parses a stdio server', () => {
    const result = mcpServerSchema.safeParse({
      name: 'fs',
      transport: {type: 'stdio', command: 'npx'},
    });
    expect(result.success).toBe(true);
  });

  it('parses an http server', () => {
    const result = mcpServerSchema.safeParse({
      name: 'remote',
      transport: {type: 'http', url: 'https://mcp.example.com/mcp'},
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-kebab-case name', () => {
    const result = mcpServerSchema.safeParse({
      name: 'Bad Name',
      transport: {type: 'stdio', command: 'x'},
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 6: Run it — fails to import**

Run: `pnpm --filter @omnicraft/settings-schema test`
Expected: FAIL — `mcpServerSchema` is not exported from the index (import is `undefined`, `.safeParse` throws / type error).

- [ ] **Step 7: Export the schemas**

In `packages/settings-schema/src/mcp/schema.ts`, add `export` to the two declarations (leave the bodies unchanged):

```ts
export const mcpTransportSchema = z.discriminatedUnion('type', [
```

```ts
export const mcpServerSchema = z.object({
```

In `packages/settings-schema/src/index.ts`, extend the mcp re-export block to include the two values (keep alphabetical ordering the file already uses):

```ts
export {
  type McpServer,
  mcpServerSchema,
  type McpSettings,
  mcpSettingsSchema,
  type McpTransport,
  mcpTransportSchema,
} from './mcp/schema.js';
```

- [ ] **Step 8: Run both package test suites — green**

Run: `pnpm --filter @omnicraft/settings-schema test && pnpm --filter @omnicraft/api-schema test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/api-schema/src/mcp packages/settings-schema/src/mcp packages/settings-schema/src/index.ts
git commit -m "feat(schema): export mcpServerSchema and drop dead 'disabled' status"
```

---

### Task 2: Frontend api `api/mcp` — status + reconnect client

**Files:**

- Create: `apps/frontend/src/api/mcp/mcp.ts`
- Create: `apps/frontend/src/api/mcp/index.ts`
- Create: `apps/frontend/src/api/mcp/mcp.test.ts`

**Interfaces:**

- Consumes: `getMcpServersResponseSchema`, `McpServerStatusResponse` from `@omnicraft/api-schema`.
- Produces:
  - `getMcpServers(): Promise<McpServerStatusResponse[]>`
  - `reconnectMcpServer(name: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/api/mcp/mcp.test.ts`:

```ts
import {afterEach, describe, expect, it, vi} from 'vitest';

import {getMcpServers, reconnectMcpServer} from './mcp.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getMcpServers', () => {
  it('returns the parsed servers array', async () => {
    const body = {
      servers: [
        {
          name: 'fs',
          transportType: 'stdio',
          status: 'connected',
          tools: [{name: 'read_file', description: 'Read a file'}],
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(body)))),
    );

    const servers = await getMcpServers();

    expect(servers).toEqual(body.servers);
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', {status: 500}))),
    );

    await expect(getMcpServers()).rejects.toThrow();
  });
});

describe('reconnectMcpServer', () => {
  it('POSTs to the reconnect endpoint', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({success: true}), {status: 202}),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await reconnectMcpServer('fs');

    expect(fetchMock).toHaveBeenCalledWith('/api/mcp/servers/fs/reconnect', {
      method: 'POST',
    });
  });

  it('throws when the server is unknown (404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({error: 'x'}), {status: 404}),
        ),
      ),
    );

    await expect(reconnectMcpServer('nope')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — fails (module missing)**

Run: `pnpm --filter @omnicraft/frontend test -- src/api/mcp/mcp.test.ts`
Expected: FAIL — cannot resolve `./mcp.js`.

- [ ] **Step 3: Implement the client**

Create `apps/frontend/src/api/mcp/mcp.ts`:

```ts
import {
  getMcpServersResponseSchema,
  type McpServerStatusResponse,
} from '@omnicraft/api-schema';

const BASE = '/api/mcp';

/** Fetches per-server connection status and discovered tools. */
export async function getMcpServers(): Promise<McpServerStatusResponse[]> {
  const res = await fetch(`${BASE}/servers`);
  if (!res.ok) {
    throw new Error(`Failed to fetch MCP servers: ${res.status.toString()}`);
  }
  const json: unknown = await res.json();
  return getMcpServersResponseSchema.parse(json).servers;
}

/** Forces a reconnect of the named server. Rejects if the server is unknown. */
export async function reconnectMcpServer(name: string): Promise<void> {
  const res = await fetch(
    `${BASE}/servers/${encodeURIComponent(name)}/reconnect`,
    {method: 'POST'},
  );
  if (!res.ok) {
    throw new Error(
      `Failed to reconnect MCP server ${name}: ${res.status.toString()}`,
    );
  }
}
```

Create `apps/frontend/src/api/mcp/index.ts`:

```ts
export {getMcpServers, reconnectMcpServer} from './mcp.js';
```

- [ ] **Step 4: Run — green**

Run: `pnpm --filter @omnicraft/frontend test -- src/api/mcp/mcp.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/api/mcp
git commit -m "feat(frontend): add MCP status + reconnect api client"
```

---

### Task 3: Frontend api `api/settings/mcp` — config-leaf accessors

**Files:**

- Create: `apps/frontend/src/api/settings/mcp/mcp.ts`
- Create: `apps/frontend/src/api/settings/mcp/index.ts`
- Create: `apps/frontend/src/api/settings/mcp/mcp.test.ts`

**Interfaces:**

- Consumes: `getSettingValue`, `putSettingValues` from `@/api/settings/index.js`; `mcpServerSchema`, `McpServer` from `@omnicraft/settings-schema`.
- Produces (see index "Shared types"):
  - `getMcpConfig(): Promise<McpConfig>`
  - `putMcpConfig(update: McpConfigUpdate): Promise<void>`
  - types `McpConfig`, `McpConfigUpdate`

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/api/settings/mcp/mcp.test.ts`:

```ts
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {getSettingValue, putSettingValues} from '@/api/settings/index.js';

import {getMcpConfig, putMcpConfig} from './mcp.js';

vi.mock('@/api/settings/index.js');

const mockedGet = vi.mocked(getSettingValue);
const mockedPut = vi.mocked(putSettingValues);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getMcpConfig', () => {
  it('reads and parses the three leaves', async () => {
    mockedGet.mockImplementation(async (path: string) => {
      if (path === 'mcp/servers') {
        return [
          {
            name: 'fs',
            transport: {type: 'stdio', command: 'npx', args: [], env: {}},
          },
        ];
      }
      return ['fs'];
    });

    const cfg = await getMcpConfig();

    expect(cfg.servers[0]?.name).toBe('fs');
    expect(cfg.enabledChat).toEqual(['fs']);
    expect(cfg.enabledCoding).toEqual(['fs']);
  });
});

describe('putMcpConfig', () => {
  it('writes only the provided leaf as a batch entry', async () => {
    mockedPut.mockResolvedValue(undefined);

    await putMcpConfig({enabledChat: ['fs']});

    expect(mockedPut).toHaveBeenCalledWith([
      {path: 'mcp/enabledByAgent/chat', value: ['fs']},
    ]);
  });

  it('writes servers and both arrays together (removal case)', async () => {
    mockedPut.mockResolvedValue(undefined);

    await putMcpConfig({servers: [], enabledChat: [], enabledCoding: []});

    expect(mockedPut).toHaveBeenCalledWith([
      {path: 'mcp/servers', value: []},
      {path: 'mcp/enabledByAgent/chat', value: []},
      {path: 'mcp/enabledByAgent/coding', value: []},
    ]);
  });

  it('is a no-op when nothing is provided', async () => {
    await putMcpConfig({});
    expect(mockedPut).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — fails (module missing)**

Run: `pnpm --filter @omnicraft/frontend test -- src/api/settings/mcp/mcp.test.ts`
Expected: FAIL — cannot resolve `./mcp.js`.

- [ ] **Step 3: Implement the accessors**

Create `apps/frontend/src/api/settings/mcp/mcp.ts`:

```ts
import {type McpServer, mcpServerSchema} from '@omnicraft/settings-schema';
import {z} from 'zod';

import {getSettingValue, putSettingValues} from '@/api/settings/index.js';

export interface McpConfig {
  servers: McpServer[];
  enabledChat: string[];
  enabledCoding: string[];
}

export interface McpConfigUpdate {
  servers?: McpServer[];
  enabledChat?: string[];
  enabledCoding?: string[];
}

const SERVERS_PATH = 'mcp/servers';
const CHAT_PATH = 'mcp/enabledByAgent/chat';
const CODING_PATH = 'mcp/enabledByAgent/coding';

const serversSchema = z.array(mcpServerSchema);
const namesSchema = z.array(z.string());

/** Reads the three MCP settings leaves and returns the parsed config. */
export async function getMcpConfig(): Promise<McpConfig> {
  const [servers, enabledChat, enabledCoding] = await Promise.all([
    getSettingValue(SERVERS_PATH),
    getSettingValue(CHAT_PATH),
    getSettingValue(CODING_PATH),
  ]);
  return {
    servers: serversSchema.parse(servers),
    enabledChat: namesSchema.parse(enabledChat),
    enabledCoding: namesSchema.parse(enabledCoding),
  };
}

/** Atomically writes whichever MCP leaves are present in `update`. */
export async function putMcpConfig(update: McpConfigUpdate): Promise<void> {
  const entries: {path: string; value: unknown}[] = [];
  if (update.servers !== undefined) {
    entries.push({path: SERVERS_PATH, value: update.servers});
  }
  if (update.enabledChat !== undefined) {
    entries.push({path: CHAT_PATH, value: update.enabledChat});
  }
  if (update.enabledCoding !== undefined) {
    entries.push({path: CODING_PATH, value: update.enabledCoding});
  }
  if (entries.length === 0) {
    return;
  }
  await putSettingValues(entries);
}
```

Create `apps/frontend/src/api/settings/mcp/index.ts`:

```ts
export {
  getMcpConfig,
  type McpConfig,
  type McpConfigUpdate,
  putMcpConfig,
} from './mcp.js';
```

- [ ] **Step 4: Run — green**

Run: `pnpm --filter @omnicraft/frontend test -- src/api/settings/mcp/mcp.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/api/settings/mcp
git commit -m "feat(frontend): add MCP settings-config api accessors"
```

---

Next: [Part 2 — helpers + presentational primitives](./part-2-helpers-and-primitives.md)
