# Part 2 — Helpers + presentational primitives (Tasks 4–6)

Back to [index](./README.md). All paths under `apps/frontend/src/pages/settings/sections/mcp/servers/`.

---

### Task 4: Pure helpers — `merge-servers` + `format-transport-summary`

**Files:**

- Create: `helpers/merge-servers.ts`
- Create: `helpers/merge-servers.test.ts`
- Create: `helpers/format-transport-summary.ts`
- Create: `helpers/format-transport-summary.test.ts`

**Interfaces:**

- Consumes: `McpServerStatusResponse` (`@omnicraft/api-schema`), `McpTransport` (`@omnicraft/settings-schema`), `McpConfig` (`@/api/settings/mcp`).
- Produces:
  - `type McpDisplayStatus`, `interface McpServerRow` (see index "Shared types")
  - `mergeServers(config: McpConfig, statuses: McpServerStatusResponse[] | null): McpServerRow[]`
  - `formatTransportSummary(transport: McpTransport): string`

- [ ] **Step 1: Write the failing `merge-servers` test**

Create `helpers/merge-servers.test.ts`:

```ts
import type {McpServerStatusResponse} from '@omnicraft/api-schema';
import {describe, expect, it} from 'vitest';

import type {McpConfig} from '@/api/settings/mcp/index.js';

import {mergeServers} from './merge-servers.js';

const stdio = (command: string) =>
  ({type: 'stdio', command, args: [], env: {}}) as const;

const config: McpConfig = {
  servers: [
    {name: 'fs', transport: stdio('npx')},
    {
      name: 'remote',
      transport: {type: 'http', url: 'https://x.example', headers: {}},
    },
    {name: 'scratch', transport: stdio('node')},
  ],
  enabledChat: ['fs'],
  enabledCoding: ['fs', 'remote'],
};

const statuses: McpServerStatusResponse[] = [
  {
    name: 'fs',
    transportType: 'stdio',
    status: 'connected',
    tools: [{name: 'read_file', description: 'r'}],
  },
  {
    name: 'remote',
    transportType: 'http',
    status: 'error',
    tools: [],
    error: 'refused',
  },
];

describe('mergeServers', () => {
  it('joins config + status by name and preserves config order', () => {
    const rows = mergeServers(config, statuses);
    expect(rows.map((r) => r.name)).toEqual(['fs', 'remote', 'scratch']);
  });

  it('carries live status, tools, error, and enablement flags', () => {
    const [fs, remote] = mergeServers(config, statuses);
    expect(fs).toMatchObject({
      status: 'connected',
      enabledChat: true,
      enabledCoding: true,
      tools: [{name: 'read_file', description: 'r'}],
    });
    expect(remote).toMatchObject({
      status: 'error',
      enabledChat: false,
      enabledCoding: true,
      error: 'refused',
    });
  });

  it('marks a server enabled for no agent as not-enabled', () => {
    const scratch = mergeServers(config, statuses)[2];
    expect(scratch.status).toBe('not-enabled');
    expect(scratch.tools).toEqual([]);
  });

  it('marks an enabled server missing from status as unknown', () => {
    // fs is enabled but no status entry present
    const rows = mergeServers(config, [statuses[1]]);
    expect(rows.find((r) => r.name === 'fs')?.status).toBe('unknown');
  });

  it('treats a null status list as unavailable (enabled -> unknown, else not-enabled)', () => {
    const rows = mergeServers(config, null);
    expect(rows.find((r) => r.name === 'fs')?.status).toBe('unknown');
    expect(rows.find((r) => r.name === 'scratch')?.status).toBe('not-enabled');
  });
});
```

- [ ] **Step 2: Run — fails (module missing)**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/helpers/merge-servers.test.ts`
Expected: FAIL — cannot resolve `./merge-servers.js`.

- [ ] **Step 3: Implement `merge-servers.ts`**

Create `helpers/merge-servers.ts`:

```ts
import type {McpServerStatusResponse} from '@omnicraft/api-schema';
import type {McpTransport} from '@omnicraft/settings-schema';

import type {McpConfig} from '@/api/settings/mcp/index.js';

export type McpDisplayStatus =
  | 'connecting'
  | 'connected'
  | 'error'
  | 'not-enabled'
  | 'unknown';

export interface McpServerRow {
  name: string;
  transport: McpTransport;
  enabledChat: boolean;
  enabledCoding: boolean;
  status: McpDisplayStatus;
  tools: {name: string; description: string}[];
  error?: string;
}

/**
 * Joins settings config with live status by server name. Config drives the row
 * set and order. `statuses === null` means the status endpoint is unavailable —
 * an enabled server then shows `unknown` rather than a false `not-enabled`.
 */
export function mergeServers(
  config: McpConfig,
  statuses: McpServerStatusResponse[] | null,
): McpServerRow[] {
  const statusByName = new Map(
    (statuses ?? []).map((status) => [status.name, status] as const),
  );

  return config.servers.map((server) => {
    const enabledChat = config.enabledChat.includes(server.name);
    const enabledCoding = config.enabledCoding.includes(server.name);
    const enabled = enabledChat || enabledCoding;
    const live = statusByName.get(server.name);

    const status: McpDisplayStatus = live
      ? live.status
      : enabled
        ? 'unknown'
        : 'not-enabled';

    return {
      name: server.name,
      transport: server.transport,
      enabledChat,
      enabledCoding,
      status,
      tools: live?.tools ?? [],
      error: live?.error,
    };
  });
}
```

- [ ] **Step 4: Run — green**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/helpers/merge-servers.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing `format-transport-summary` test**

Create `helpers/format-transport-summary.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {formatTransportSummary} from './format-transport-summary.js';

describe('formatTransportSummary', () => {
  it('formats a stdio transport with command and args', () => {
    expect(
      formatTransportSummary({
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'server', '/path'],
        env: {},
      }),
    ).toBe('stdio · npx -y server /path');
  });

  it('formats a stdio transport with no args', () => {
    expect(
      formatTransportSummary({
        type: 'stdio',
        command: 'node ./s.js',
        args: [],
        env: {},
      }),
    ).toBe('stdio · node ./s.js');
  });

  it('formats an http transport', () => {
    expect(
      formatTransportSummary({
        type: 'http',
        url: 'https://mcp.example.com/mcp',
        headers: {},
      }),
    ).toBe('http · https://mcp.example.com/mcp');
  });
});
```

- [ ] **Step 6: Run — fails**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/helpers/format-transport-summary.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 7: Implement `format-transport-summary.ts`**

Create `helpers/format-transport-summary.ts`:

```ts
import type {McpTransport} from '@omnicraft/settings-schema';

/** One-line human summary of a transport for the server card. */
export function formatTransportSummary(transport: McpTransport): string {
  if (transport.type === 'stdio') {
    const command = [transport.command, ...transport.args].join(' ');
    return `stdio · ${command}`;
  }
  return `http · ${transport.url}`;
}
```

- [ ] **Step 8: Run — green, then commit**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/helpers`
Expected: PASS (8 tests total).

```bash
git add apps/frontend/src/pages/settings/sections/mcp/servers/helpers
git commit -m "feat(frontend): add MCP server merge + transport-summary helpers"
```

---

### Task 5: `StatusChip` presentational component

**Files:**

- Create: `components/StatusChip/StatusChip.tsx`
- Create: `components/StatusChip/index.ts`
- Create: `components/StatusChip/StatusChip.test.tsx`

**Interfaces:**

- Consumes: `McpDisplayStatus` from `../../helpers/merge-servers.js`.
- Produces: `StatusChip({status: McpDisplayStatus})`.

- [ ] **Step 1: Write the failing test**

Create `components/StatusChip/StatusChip.test.tsx`:

```tsx
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {StatusChip} from './index.js';

describe('StatusChip', () => {
  it('renders the connected label', () => {
    render(<StatusChip status='connected' />);
    expect(screen.getByText('connected')).toBeInTheDocument();
  });

  it('renders the not-enabled label', () => {
    render(<StatusChip status='not-enabled' />);
    expect(screen.getByText('not enabled')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/components/StatusChip/StatusChip.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `components/StatusChip/StatusChip.tsx`:

```tsx
import {Chip, Spinner} from '@heroui/react';

import type {McpDisplayStatus} from '../../helpers/merge-servers.js';

interface StatusChipProps {
  status: McpDisplayStatus;
}

type ChipColor = 'success' | 'danger' | 'warning' | 'default';

const STATUS_CONFIG: Record<
  McpDisplayStatus,
  {label: string; color: ChipColor}
> = {
  connected: {label: 'connected', color: 'success'},
  error: {label: 'error', color: 'danger'},
  connecting: {label: 'connecting', color: 'warning'},
  unknown: {label: 'unknown', color: 'default'},
  'not-enabled': {label: 'not enabled', color: 'default'},
};

export function StatusChip({status}: StatusChipProps) {
  const {label, color} = STATUS_CONFIG[status];
  return (
    <Chip color={color} variant='soft' size='sm'>
      {status === 'connecting' && <Spinner size='sm' color='current' />}
      {label}
    </Chip>
  );
}
```

Create `components/StatusChip/index.ts`:

```ts
export {StatusChip} from './StatusChip.js';
```

- [ ] **Step 4: Run — green, commit**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/components/StatusChip/StatusChip.test.tsx`
Expected: PASS (2 tests).

```bash
git add apps/frontend/src/pages/settings/sections/mcp/servers/components/StatusChip
git commit -m "feat(frontend): add MCP StatusChip component"
```

---

### Task 6: Field editors — `KeyValueEditor` + `StringListEditor`

Two small controlled editors used by the form modal. Both operate on plain arrays (not `Record`) so mid-edit empty/duplicate keys never collapse rows; the form converts to `Record` at submit.

**Files:**

- Create: `components/StringListEditor/StringListEditor.tsx`, `index.ts`, `styles.module.css`, `StringListEditor.test.tsx`
- Create: `components/KeyValueEditor/KeyValueEditor.tsx`, `index.ts`, `styles.module.css`, `KeyValueEditor.test.tsx`

**Interfaces:**

- Produces:
  - `StringListEditor({items: string[], onChange: (items: string[]) => void, addLabel: string, placeholder?: string, isDisabled?: boolean})`
  - `KeyValueEditor({entries: [string, string][], onChange: (entries: [string, string][]) => void, addLabel: string, keyPlaceholder?: string, valuePlaceholder?: string, isDisabled?: boolean})`

- [ ] **Step 1: Write the failing `StringListEditor` test**

Create `components/StringListEditor/StringListEditor.test.tsx`:

```tsx
import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {StringListEditor} from './index.js';

describe('StringListEditor', () => {
  it('appends an empty row on add', () => {
    const onChange = vi.fn();
    render(
      <StringListEditor
        items={['-y']}
        addLabel='Add argument'
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Add argument'}));
    expect(onChange).toHaveBeenCalledWith(['-y', '']);
  });

  it('edits a row', () => {
    const onChange = vi.fn();
    render(
      <StringListEditor items={['-y']} addLabel='Add' onChange={onChange} />,
    );
    fireEvent.change(screen.getByRole('textbox', {name: 'Argument 1'}), {
      target: {value: '-x'},
    });
    expect(onChange).toHaveBeenCalledWith(['-x']);
  });

  it('removes a row', () => {
    const onChange = vi.fn();
    render(
      <StringListEditor
        items={['-y', '-x']}
        addLabel='Add'
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Remove argument 1'}));
    expect(onChange).toHaveBeenCalledWith(['-x']);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/components/StringListEditor/StringListEditor.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `StringListEditor`**

Create `components/StringListEditor/StringListEditor.tsx`:

```tsx
import {Button, Input, TextField} from '@heroui/react';
import {Trash2} from 'lucide-react';

import styles from './styles.module.css';

interface StringListEditorProps {
  items: string[];
  onChange: (items: string[]) => void;
  addLabel: string;
  placeholder?: string;
  isDisabled?: boolean;
}

export function StringListEditor({
  items,
  onChange,
  addLabel,
  placeholder,
  isDisabled,
}: StringListEditorProps) {
  const setAt = (index: number, value: string) => {
    onChange(items.map((item, i) => (i === index ? value : item)));
  };
  const removeAt = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.list}>
      {items.map((item, index) => (
        // Row identity is positional; index key is intentional here.
        <div className={styles.row} key={index}>
          <TextField
            aria-label={`Argument ${(index + 1).toString()}`}
            className={styles.input}
            value={item}
            isDisabled={isDisabled}
            onChange={(value) => {
              setAt(index, value);
            }}
          >
            <Input placeholder={placeholder} />
          </TextField>
          <Button
            aria-label={`Remove argument ${(index + 1).toString()}`}
            size='sm'
            variant='ghost'
            isDisabled={isDisabled}
            onPress={() => {
              removeAt(index);
            }}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
      <Button
        size='sm'
        variant='ghost'
        isDisabled={isDisabled}
        onPress={() => {
          onChange([...items, '']);
        }}
      >
        {addLabel}
      </Button>
    </div>
  );
}
```

Create `components/StringListEditor/index.ts`:

```ts
export {StringListEditor} from './StringListEditor.js';
```

Create `components/StringListEditor/styles.module.css`:

```css
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input {
  flex: 1;
}
```

- [ ] **Step 4: Run — green**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/components/StringListEditor/StringListEditor.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing `KeyValueEditor` test**

Create `components/KeyValueEditor/KeyValueEditor.test.tsx`:

```tsx
import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {KeyValueEditor} from './index.js';

describe('KeyValueEditor', () => {
  it('appends an empty pair on add', () => {
    const onChange = vi.fn();
    render(
      <KeyValueEditor
        entries={[['NODE_ENV', 'production']]}
        addLabel='Add variable'
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Add variable'}));
    expect(onChange).toHaveBeenCalledWith([
      ['NODE_ENV', 'production'],
      ['', ''],
    ]);
  });

  it('edits a key and a value independently', () => {
    const onChange = vi.fn();
    render(
      <KeyValueEditor
        entries={[['A', 'b']]}
        addLabel='Add'
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', {name: 'Key 1'}), {
      target: {value: 'TOKEN'},
    });
    expect(onChange).toHaveBeenLastCalledWith([['TOKEN', 'b']]);
    fireEvent.change(screen.getByRole('textbox', {name: 'Value 1'}), {
      target: {value: 'secret'},
    });
    expect(onChange).toHaveBeenLastCalledWith([['A', 'secret']]);
  });

  it('removes a pair', () => {
    const onChange = vi.fn();
    render(
      <KeyValueEditor
        entries={[
          ['A', 'b'],
          ['C', 'd'],
        ]}
        addLabel='Add'
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Remove pair 1'}));
    expect(onChange).toHaveBeenCalledWith([['C', 'd']]);
  });
});
```

- [ ] **Step 6: Run — fails**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/components/KeyValueEditor/KeyValueEditor.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 7: Implement `KeyValueEditor`**

Create `components/KeyValueEditor/KeyValueEditor.tsx`:

```tsx
import {Button, Input, TextField} from '@heroui/react';
import {Trash2} from 'lucide-react';

import styles from './styles.module.css';

interface KeyValueEditorProps {
  entries: [string, string][];
  onChange: (entries: [string, string][]) => void;
  addLabel: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  isDisabled?: boolean;
}

export function KeyValueEditor({
  entries,
  onChange,
  addLabel,
  keyPlaceholder,
  valuePlaceholder,
  isDisabled,
}: KeyValueEditorProps) {
  const setKey = (index: number, key: string) => {
    onChange(
      entries.map((entry, i) => (i === index ? [key, entry[1]] : entry)),
    );
  };
  const setValue = (index: number, value: string) => {
    onChange(
      entries.map((entry, i) => (i === index ? [entry[0], value] : entry)),
    );
  };
  const removeAt = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.list}>
      {entries.map(([key, value], index) => (
        // Row identity is positional; index key is intentional here.
        <div className={styles.row} key={index}>
          <TextField
            aria-label={`Key ${(index + 1).toString()}`}
            className={styles.key}
            value={key}
            isDisabled={isDisabled}
            onChange={(next) => {
              setKey(index, next);
            }}
          >
            <Input placeholder={keyPlaceholder} />
          </TextField>
          <TextField
            aria-label={`Value ${(index + 1).toString()}`}
            className={styles.value}
            value={value}
            isDisabled={isDisabled}
            onChange={(next) => {
              setValue(index, next);
            }}
          >
            <Input placeholder={valuePlaceholder} />
          </TextField>
          <Button
            aria-label={`Remove pair ${(index + 1).toString()}`}
            size='sm'
            variant='ghost'
            isDisabled={isDisabled}
            onPress={() => {
              removeAt(index);
            }}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
      <Button
        size='sm'
        variant='ghost'
        isDisabled={isDisabled}
        onPress={() => {
          onChange([...entries, ['', '']]);
        }}
      >
        {addLabel}
      </Button>
    </div>
  );
}
```

Create `components/KeyValueEditor/index.ts`:

```ts
export {KeyValueEditor} from './KeyValueEditor.js';
```

Create `components/KeyValueEditor/styles.module.css`:

```css
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.key {
  flex: 0 0 38%;
}

.value {
  flex: 1;
}
```

- [ ] **Step 8: Run — green, commit**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/components/KeyValueEditor/KeyValueEditor.test.tsx`
Expected: PASS (3 tests).

```bash
git add apps/frontend/src/pages/settings/sections/mcp/servers/components/StringListEditor apps/frontend/src/pages/settings/sections/mcp/servers/components/KeyValueEditor
git commit -m "feat(frontend): add StringListEditor and KeyValueEditor field editors"
```

---

Next: [Part 3 — form modal](./part-3-form-modal.md)
