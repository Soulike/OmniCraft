# Part 4 — Card + list (Tasks 9–10)

Back to [index](./README.md). All paths under `apps/frontend/src/pages/settings/sections/mcp/servers/components/`.

---

### Task 9: `ServerCard` component

One server rendered as a HeroUI `Card`: name + `StatusChip` + Edit/Remove; transport summary; error `Alert`; Chat/Coding `Switch`es + Reconnect (hidden when `not-enabled`); tools `Disclosure`.

**Files:**

- Create: `ServerCard/ServerCard.tsx`
- Create: `ServerCard/index.ts`
- Create: `ServerCard/styles.module.css`
- Create: `ServerCard/ServerCard.test.tsx`

**Interfaces:**

- Consumes: `McpServerRow` (`../../helpers/merge-servers.js`), `formatTransportSummary` (`../../helpers/format-transport-summary.js`), `StatusChip` (Task 5), `AgentType` (`@omnicraft/settings-schema`).
- Produces:

```ts
interface ServerCardProps {
  row: McpServerRow;
  isSaving: boolean;
  onToggle: (agentType: AgentType, enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
  onReconnect: () => void;
}
function ServerCard(props: ServerCardProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

Create `ServerCard/ServerCard.test.tsx`:

```tsx
import {fireEvent, render, screen} from '@testing-library/react';
import {AgentType} from '@omnicraft/settings-schema';
import {describe, expect, it, vi} from 'vitest';

import type {McpServerRow} from '../../helpers/merge-servers.js';

import {ServerCard} from './index.js';

const baseRow: McpServerRow = {
  name: 'fs',
  transport: {type: 'stdio', command: 'npx', args: ['-y'], env: {}},
  enabledChat: false,
  enabledCoding: false,
  status: 'not-enabled',
  tools: [],
};

function renderCard(
  overrides: Partial<McpServerRow> = {},
  handlers: Partial<{
    onToggle: (a: AgentType, e: boolean) => void;
    onReconnect: () => void;
  }> = {},
) {
  render(
    <ServerCard
      row={{...baseRow, ...overrides}}
      isSaving={false}
      onToggle={handlers.onToggle ?? vi.fn()}
      onEdit={vi.fn()}
      onRemove={vi.fn()}
      onReconnect={handlers.onReconnect ?? vi.fn()}
    />,
  );
}

describe('ServerCard', () => {
  it('shows the name and transport summary', () => {
    renderCard();
    expect(screen.getByText('fs')).toBeInTheDocument();
    expect(screen.getByText('stdio · npx -y')).toBeInTheDocument();
  });

  it('hides reconnect for a not-enabled server', () => {
    renderCard({status: 'not-enabled'});
    expect(screen.queryByRole('button', {name: 'Reconnect'})).toBeNull();
  });

  it('shows reconnect for a connected server', () => {
    renderCard({status: 'connected', enabledChat: true});
    expect(screen.getByRole('button', {name: 'Reconnect'})).toBeInTheDocument();
  });

  it('toggles chat enablement', () => {
    const onToggle = vi.fn();
    renderCard({}, {onToggle});
    fireEvent.click(screen.getByRole('switch', {name: 'Chat'}));
    expect(onToggle).toHaveBeenCalledWith(AgentType.CHAT, true);
  });

  it('lists discovered tools when expanded', () => {
    renderCard({
      status: 'connected',
      enabledChat: true,
      tools: [{name: 'read_file', description: 'Read a file'}],
    });
    fireEvent.click(screen.getByRole('button', {name: /tool/}));
    expect(screen.getByText('read_file')).toBeInTheDocument();
  });

  it('shows the error reason for an error server', () => {
    renderCard({status: 'error', enabledChat: true, error: 'refused'});
    expect(screen.getByText('refused')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/components/ServerCard/ServerCard.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `ServerCard.tsx`**

Create `ServerCard/ServerCard.tsx`:

```tsx
import {Alert, Button, Card, Disclosure, ListBox, Switch} from '@heroui/react';
import {AgentType} from '@omnicraft/settings-schema';

import {formatTransportSummary} from '../../helpers/format-transport-summary.js';
import type {McpServerRow} from '../../helpers/merge-servers.js';
import {StatusChip} from '../StatusChip/index.js';
import styles from './styles.module.css';

interface ServerCardProps {
  row: McpServerRow;
  isSaving: boolean;
  onToggle: (agentType: AgentType, enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
  onReconnect: () => void;
}

export function ServerCard({
  row,
  isSaving,
  onToggle,
  onEdit,
  onRemove,
  onReconnect,
}: ServerCardProps) {
  const toolCount = row.tools.length;

  return (
    <Card>
      <Card.Content>
        <div className={styles.content}>
          <div className={styles.headerRow}>
            <span className={styles.name}>{row.name}</span>
            <StatusChip status={row.status} />
            <div className={styles.headerActions}>
              <Button
                size='sm'
                variant='ghost'
                isDisabled={isSaving}
                onPress={onEdit}
              >
                Edit
              </Button>
              <Button
                size='sm'
                variant='danger'
                isDisabled={isSaving}
                onPress={onRemove}
              >
                Remove
              </Button>
            </div>
          </div>

          <p className={styles.transport}>
            {formatTransportSummary(row.transport)}
          </p>

          {row.status === 'error' && row.error !== undefined && (
            <Alert status='danger'>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{row.error}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          <div className={styles.enableRow}>
            <span className={styles.enableLabel}>Enable for</span>
            <Switch
              isSelected={row.enabledChat}
              isDisabled={isSaving}
              onChange={(selected) => {
                onToggle(AgentType.CHAT, selected);
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                Chat
              </Switch.Content>
            </Switch>
            <Switch
              isSelected={row.enabledCoding}
              isDisabled={isSaving}
              onChange={(selected) => {
                onToggle(AgentType.CODING, selected);
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                Coding
              </Switch.Content>
            </Switch>
            {row.status !== 'not-enabled' && (
              <Button
                className={styles.reconnect}
                size='sm'
                variant='ghost'
                isDisabled={isSaving}
                onPress={onReconnect}
              >
                Reconnect
              </Button>
            )}
          </div>

          {toolCount > 0 && (
            <Disclosure>
              <Disclosure.Heading>
                <Disclosure.Trigger className={styles.toolsTrigger}>
                  {toolCount} {toolCount === 1 ? 'tool' : 'tools'}
                  <Disclosure.Indicator />
                </Disclosure.Trigger>
              </Disclosure.Heading>
              <Disclosure.Content>
                <ListBox aria-label={`${row.name} tools`} selectionMode='none'>
                  {row.tools.map((tool) => (
                    <ListBox.Item
                      key={tool.name}
                      id={tool.name}
                      textValue={tool.name}
                    >
                      <span className={styles.toolName}>{tool.name}</span>
                      {tool.description !== '' && (
                        <span className={styles.toolDesc}>
                          {tool.description}
                        </span>
                      )}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Disclosure.Content>
            </Disclosure>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
```

Create `ServerCard/index.ts`:

```ts
export {ServerCard} from './ServerCard.js';
```

Create `ServerCard/styles.module.css`:

```css
.content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.headerRow {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600;
}

.headerActions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.transport {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  color: var(--foreground);
  opacity: 0.72;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.enableRow {
  display: flex;
  align-items: center;
  gap: 16px;
}

.enableLabel {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--foreground);
  opacity: 0.55;
}

.reconnect {
  margin-left: auto;
}

.toolsTrigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.toolName {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.toolDesc {
  margin-left: 8px;
  opacity: 0.7;
}
```

- [ ] **Step 4: Run — green**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/components/ServerCard/ServerCard.test.tsx`
Expected: PASS (6 tests).

> If `getByRole('switch', {name: 'Chat'})` fails, the Switch label association differs in the installed HeroUI — check `get_component_docs(["Switch"])`. The contract: clicking the Chat switch calls `onToggle(AgentType.CHAT, true)` when it was off.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/settings/sections/mcp/servers/components/ServerCard
git commit -m "feat(frontend): add ServerCard component"
```

---

### Task 10: `ServerList` component

Maps rows to `ServerCard`, binding each server's `name` into the callbacks; renders an empty state when there are no servers.

**Files:**

- Create: `ServerList/ServerList.tsx`
- Create: `ServerList/index.ts`
- Create: `ServerList/styles.module.css`
- Create: `ServerList/ServerList.test.tsx`

**Interfaces:**

- Consumes: `ServerCard` (Task 9), `McpServerRow`, `AgentType`.
- Produces:

```ts
interface ServerListProps {
  rows: McpServerRow[];
  isSaving: boolean;
  onToggle: (name: string, agentType: AgentType, enabled: boolean) => void;
  onEdit: (name: string) => void;
  onRemove: (name: string) => void;
  onReconnect: (name: string) => void;
}
function ServerList(props: ServerListProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

Create `ServerList/ServerList.test.tsx`:

```tsx
import {render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import type {McpServerRow} from '../../helpers/merge-servers.js';

import {ServerList} from './index.js';

const noop = vi.fn();

function props(rows: McpServerRow[]) {
  return {
    rows,
    isSaving: false,
    onToggle: noop,
    onEdit: noop,
    onRemove: noop,
    onReconnect: noop,
  };
}

describe('ServerList', () => {
  it('shows an empty state when there are no servers', () => {
    render(<ServerList {...props([])} />);
    expect(
      screen.getByText('No MCP servers configured yet.'),
    ).toBeInTheDocument();
  });

  it('renders a card per server', () => {
    const rows: McpServerRow[] = [
      {
        name: 'fs',
        transport: {type: 'stdio', command: 'npx', args: [], env: {}},
        enabledChat: false,
        enabledCoding: false,
        status: 'not-enabled',
        tools: [],
      },
    ];
    render(<ServerList {...props(rows)} />);
    expect(screen.getByText('fs')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/components/ServerList/ServerList.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `ServerList.tsx`**

Create `ServerList/ServerList.tsx`:

```tsx
import type {AgentType} from '@omnicraft/settings-schema';

import type {McpServerRow} from '../../helpers/merge-servers.js';
import {ServerCard} from '../ServerCard/index.js';
import styles from './styles.module.css';

interface ServerListProps {
  rows: McpServerRow[];
  isSaving: boolean;
  onToggle: (name: string, agentType: AgentType, enabled: boolean) => void;
  onEdit: (name: string) => void;
  onRemove: (name: string) => void;
  onReconnect: (name: string) => void;
}

export function ServerList({
  rows,
  isSaving,
  onToggle,
  onEdit,
  onRemove,
  onReconnect,
}: ServerListProps) {
  if (rows.length === 0) {
    return <p className={styles.empty}>No MCP servers configured yet.</p>;
  }

  return (
    <div className={styles.list}>
      {rows.map((row) => (
        <ServerCard
          key={row.name}
          row={row}
          isSaving={isSaving}
          onToggle={(agentType, enabled) => {
            onToggle(row.name, agentType, enabled);
          }}
          onEdit={() => {
            onEdit(row.name);
          }}
          onRemove={() => {
            onRemove(row.name);
          }}
          onReconnect={() => {
            onReconnect(row.name);
          }}
        />
      ))}
    </div>
  );
}
```

Create `ServerList/index.ts`:

```ts
export {ServerList} from './ServerList.js';
```

Create `ServerList/styles.module.css`:

```css
.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty {
  color: var(--foreground);
  opacity: 0.65;
}
```

- [ ] **Step 4: Run — green, commit**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/components/ServerList/ServerList.test.tsx`
Expected: PASS (2 tests).

```bash
git add apps/frontend/src/pages/settings/sections/mcp/servers/components/ServerList
git commit -m "feat(frontend): add ServerList component"
```

---

Next: [Part 5 — data hooks](./part-5-data-hooks.md)
