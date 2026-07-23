# Part 3 — Form modal (Tasks 7–8)

Back to [index](./README.md). All paths under `apps/frontend/src/pages/settings/sections/mcp/servers/components/ServerFormModal/`.

---

### Task 7: `useServerForm` hook — form state + validation

Owns the add/edit form field state, transport switching, and submit-time validation. Works on plain arrays/pairs; converts `env`/`headers` pairs to `Record` and drops empty rows only at `validate()`.

**Files:**

- Create: `hooks/useServerForm.ts`
- Create: `hooks/useServerForm.test.ts`

**Interfaces:**

- Consumes: `McpServer`, `McpTransport` from `@omnicraft/settings-schema`; `z` from `zod`.
- Produces:

```ts
interface FormErrors {
  name?: string;
  command?: string;
  url?: string;
}
interface UseServerForm {
  name: string;
  setName: (value: string) => void;
  transportType: 'stdio' | 'http';
  setTransportType: (type: 'stdio' | 'http') => void;
  command: string;
  setCommand: (value: string) => void;
  args: string[];
  setArgs: (value: string[]) => void;
  envEntries: [string, string][];
  setEnvEntries: (value: [string, string][]) => void;
  url: string;
  setUrl: (value: string) => void;
  headerEntries: [string, string][];
  setHeaderEntries: (value: [string, string][]) => void;
  errors: FormErrors;
  isEdit: boolean;
  validate: () => McpServer | null;
}
function useServerForm(params: {
  initial?: McpServer;
  existingNames: string[];
}): UseServerForm;
```

Note: `existingNames` must already **exclude** the name being edited (the caller strips it). The hook holds fresh state from mount; the modal remounts it per open (Task 14), so no `initial`-sync effect is needed.

- [ ] **Step 1: Write the failing tests**

Create `hooks/useServerForm.test.ts`:

```ts
import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {useServerForm} from './useServerForm.js';

describe('useServerForm', () => {
  it('builds a stdio server from filled fields', () => {
    const {result} = renderHook(() => useServerForm({existingNames: []}));
    act(() => {
      result.current.setName('fs');
      result.current.setCommand('npx');
      result.current.setArgs(['-y', '']);
      result.current.setEnvEntries([
        ['NODE_ENV', 'production'],
        ['', 'ignored'],
      ]);
    });
    let server: unknown;
    act(() => {
      server = result.current.validate();
    });
    expect(server).toEqual({
      name: 'fs',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y'],
        env: {NODE_ENV: 'production'},
      },
    });
  });

  it('builds an http server', () => {
    const {result} = renderHook(() => useServerForm({existingNames: []}));
    act(() => {
      result.current.setName('remote');
      result.current.setTransportType('http');
      result.current.setUrl('https://mcp.example.com/mcp');
      result.current.setHeaderEntries([['Authorization', 'Bearer x']]);
    });
    let server: unknown;
    act(() => {
      server = result.current.validate();
    });
    expect(server).toEqual({
      name: 'remote',
      transport: {
        type: 'http',
        url: 'https://mcp.example.com/mcp',
        headers: {Authorization: 'Bearer x'},
      },
    });
  });

  it('rejects a duplicate name', () => {
    const {result} = renderHook(() => useServerForm({existingNames: ['fs']}));
    act(() => {
      result.current.setName('fs');
      result.current.setCommand('npx');
    });
    act(() => {
      expect(result.current.validate()).toBeNull();
    });
    expect(result.current.errors.name).toMatch(/already exists/);
  });

  it('rejects an invalid name', () => {
    const {result} = renderHook(() => useServerForm({existingNames: []}));
    act(() => {
      result.current.setName('Bad Name');
      result.current.setCommand('npx');
    });
    act(() => {
      expect(result.current.validate()).toBeNull();
    });
    expect(result.current.errors.name).toBeDefined();
  });

  it('requires a command for stdio', () => {
    const {result} = renderHook(() => useServerForm({existingNames: []}));
    act(() => {
      result.current.setName('fs');
    });
    act(() => {
      expect(result.current.validate()).toBeNull();
    });
    expect(result.current.errors.command).toBeDefined();
  });

  it('requires a valid url for http', () => {
    const {result} = renderHook(() => useServerForm({existingNames: []}));
    act(() => {
      result.current.setName('remote');
      result.current.setTransportType('http');
      result.current.setUrl('not-a-url');
    });
    act(() => {
      expect(result.current.validate()).toBeNull();
    });
    expect(result.current.errors.url).toBeDefined();
  });

  it('clears the other transport fields on switch but keeps the name', () => {
    const {result} = renderHook(() => useServerForm({existingNames: []}));
    act(() => {
      result.current.setName('fs');
      result.current.setCommand('npx');
    });
    act(() => {
      result.current.setTransportType('http');
    });
    expect(result.current.name).toBe('fs');
    expect(result.current.command).toBe('');
  });

  it('hydrates from an initial server for edit', () => {
    const {result} = renderHook(() =>
      useServerForm({
        existingNames: [],
        initial: {
          name: 'fs',
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['a'],
            env: {K: 'v'},
          },
        },
      }),
    );
    expect(result.current.isEdit).toBe(true);
    expect(result.current.name).toBe('fs');
    expect(result.current.command).toBe('node');
    expect(result.current.args).toEqual(['a']);
    expect(result.current.envEntries).toEqual([['K', 'v']]);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/components/ServerFormModal/hooks/useServerForm.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `useServerForm.ts`**

Create `hooks/useServerForm.ts`:

```ts
import type {McpServer, McpTransport} from '@omnicraft/settings-schema';
import {useCallback, useState} from 'react';
import {z} from 'zod';

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

interface FormErrors {
  name?: string;
  command?: string;
  url?: string;
}

export interface UseServerForm {
  name: string;
  setName: (value: string) => void;
  transportType: 'stdio' | 'http';
  setTransportType: (type: 'stdio' | 'http') => void;
  command: string;
  setCommand: (value: string) => void;
  args: string[];
  setArgs: (value: string[]) => void;
  envEntries: [string, string][];
  setEnvEntries: (value: [string, string][]) => void;
  url: string;
  setUrl: (value: string) => void;
  headerEntries: [string, string][];
  setHeaderEntries: (value: [string, string][]) => void;
  errors: FormErrors;
  isEdit: boolean;
  validate: () => McpServer | null;
}

interface UseServerFormParams {
  initial?: McpServer;
  existingNames: string[];
}

function pairsToRecord(entries: [string, string][]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of entries) {
    const trimmed = key.trim();
    if (trimmed !== '') {
      record[trimmed] = value;
    }
  }
  return record;
}

function recordToPairs(record: Record<string, string>): [string, string][] {
  return Object.entries(record);
}

export function useServerForm({
  initial,
  existingNames,
}: UseServerFormParams): UseServerForm {
  const initialTransport = initial?.transport;
  const [name, setName] = useState(initial?.name ?? '');
  const [transportType, setTransportType] = useState<'stdio' | 'http'>(
    initialTransport?.type ?? 'stdio',
  );
  const [command, setCommand] = useState(
    initialTransport?.type === 'stdio' ? initialTransport.command : '',
  );
  const [args, setArgs] = useState<string[]>(
    initialTransport?.type === 'stdio' ? initialTransport.args : [],
  );
  const [envEntries, setEnvEntries] = useState<[string, string][]>(
    initialTransport?.type === 'stdio'
      ? recordToPairs(initialTransport.env)
      : [],
  );
  const [url, setUrl] = useState(
    initialTransport?.type === 'http' ? initialTransport.url : '',
  );
  const [headerEntries, setHeaderEntries] = useState<[string, string][]>(
    initialTransport?.type === 'http'
      ? recordToPairs(initialTransport.headers)
      : [],
  );
  const [errors, setErrors] = useState<FormErrors>({});

  const changeTransportType = useCallback((type: 'stdio' | 'http') => {
    setTransportType(type);
    if (type === 'stdio') {
      setUrl('');
      setHeaderEntries([]);
    } else {
      setCommand('');
      setArgs([]);
      setEnvEntries([]);
    }
  }, []);

  const validate = useCallback((): McpServer | null => {
    const nextErrors: FormErrors = {};
    const trimmedName = name.trim();

    if (!NAME_PATTERN.test(trimmedName)) {
      nextErrors.name =
        'Use lowercase letters, digits, and dashes; start with a letter or digit.';
    } else if (existingNames.includes(trimmedName)) {
      nextErrors.name = `A server named "${trimmedName}" already exists.`;
    }

    let transport: McpTransport | null = null;
    if (transportType === 'stdio') {
      if (command.trim() === '') {
        nextErrors.command = 'Command is required.';
      } else {
        transport = {
          type: 'stdio',
          command: command.trim(),
          args: args.filter((arg) => arg !== ''),
          env: pairsToRecord(envEntries),
        };
      }
    } else {
      const parsedUrl = z.url().safeParse(url.trim());
      if (!parsedUrl.success) {
        nextErrors.url = 'Enter a valid URL (https://…).';
      } else {
        transport = {
          type: 'http',
          url: parsedUrl.data,
          headers: pairsToRecord(headerEntries),
        };
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || transport === null) {
      return null;
    }
    return {name: trimmedName, transport};
  }, [
    name,
    existingNames,
    transportType,
    command,
    args,
    envEntries,
    url,
    headerEntries,
  ]);

  return {
    name,
    setName,
    transportType,
    setTransportType: changeTransportType,
    command,
    setCommand,
    args,
    setArgs,
    envEntries,
    setEnvEntries,
    url,
    setUrl,
    headerEntries,
    setHeaderEntries,
    errors,
    isEdit: initial !== undefined,
    validate,
  };
}
```

- [ ] **Step 4: Run — green, commit**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/components/ServerFormModal/hooks/useServerForm.test.ts`
Expected: PASS (8 tests).

```bash
git add apps/frontend/src/pages/settings/sections/mcp/servers/components/ServerFormModal/hooks
git commit -m "feat(frontend): add useServerForm hook"
```

---

### Task 8: `ServerFormModal` component — add/edit dialog

Container calls `useServerForm`, wires submit; view renders the HeroUI `Modal`. The parent remounts this component per open via a `key` (Task 14), so it always mounts with fresh field state.

**Files:**

- Create: `ServerFormModal.tsx` (container)
- Create: `ServerFormModalView.tsx` (stateless view)
- Create: `index.ts`
- Create: `styles.module.css`
- Create: `ServerFormModal.test.tsx`

**Interfaces:**

- Consumes: `useServerForm`, `UseServerForm` (`./hooks/useServerForm.js`); `StringListEditor`, `KeyValueEditor` (Task 6); `McpServer` (`@omnicraft/settings-schema`).
- Produces:

```ts
interface ServerFormModalProps {
  isOpen: boolean;
  mode: 'add' | 'edit';
  initial?: McpServer;
  existingNames: string[]; // excluding the edited name
  isSaving: boolean;
  onSubmit: (server: McpServer) => void;
  onClose: () => void;
}
function ServerFormModal(props: ServerFormModalProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

Create `ServerFormModal.test.tsx`:

```tsx
import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {ServerFormModal} from './index.js';

describe('ServerFormModal', () => {
  it('submits a new stdio server', () => {
    const onSubmit = vi.fn();
    render(
      <ServerFormModal
        isOpen
        mode='add'
        existingNames={[]}
        isSaving={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', {name: 'Name'}), {
      target: {value: 'fs'},
    });
    fireEvent.change(screen.getByRole('textbox', {name: 'Command'}), {
      target: {value: 'npx'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Add'}));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'fs',
      transport: {type: 'stdio', command: 'npx', args: [], env: {}},
    });
  });

  it('blocks a duplicate name and shows an error', () => {
    const onSubmit = vi.fn();
    render(
      <ServerFormModal
        isOpen
        mode='add'
        existingNames={['fs']}
        isSaving={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', {name: 'Name'}), {
      target: {value: 'fs'},
    });
    fireEvent.change(screen.getByRole('textbox', {name: 'Command'}), {
      target: {value: 'npx'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Add'}));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/already exists/)).toBeInTheDocument();
  });

  it('makes the name read-only in edit mode', () => {
    render(
      <ServerFormModal
        isOpen
        mode='edit'
        initial={{
          name: 'fs',
          transport: {type: 'stdio', command: 'npx', args: [], env: {}},
        }}
        existingNames={[]}
        isSaving={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', {name: 'Name'})).toHaveAttribute(
      'readonly',
    );
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/components/ServerFormModal/ServerFormModal.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the container**

Create `ServerFormModal.tsx`:

```tsx
import type {McpServer} from '@omnicraft/settings-schema';
import {useCallback} from 'react';

import {useServerForm} from './hooks/useServerForm.js';
import {ServerFormModalView} from './ServerFormModalView.js';

interface ServerFormModalProps {
  isOpen: boolean;
  mode: 'add' | 'edit';
  initial?: McpServer;
  existingNames: string[];
  isSaving: boolean;
  onSubmit: (server: McpServer) => void;
  onClose: () => void;
}

export function ServerFormModal({
  isOpen,
  mode,
  initial,
  existingNames,
  isSaving,
  onSubmit,
  onClose,
}: ServerFormModalProps) {
  const form = useServerForm({initial, existingNames});

  const handleSubmit = useCallback(() => {
    const server = form.validate();
    if (server) {
      onSubmit(server);
    }
  }, [form, onSubmit]);

  return (
    <ServerFormModalView
      isOpen={isOpen}
      mode={mode}
      isSaving={isSaving}
      form={form}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
}
```

- [ ] **Step 4: Implement the view**

Create `ServerFormModalView.tsx`:

```tsx
import {
  Button,
  Description,
  FieldError,
  Input,
  Label,
  Modal,
  Spinner,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@heroui/react';

import {KeyValueEditor} from '../KeyValueEditor/index.js';
import {StringListEditor} from '../StringListEditor/index.js';
import type {UseServerForm} from './hooks/useServerForm.js';
import styles from './styles.module.css';

interface ServerFormModalViewProps {
  isOpen: boolean;
  mode: 'add' | 'edit';
  isSaving: boolean;
  form: UseServerForm;
  onSubmit: () => void;
  onClose: () => void;
}

export function ServerFormModalView({
  isOpen,
  mode,
  isSaving,
  form,
  onSubmit,
  onClose,
}: ServerFormModalViewProps) {
  return (
    <Modal.Backdrop
      isOpen={isOpen}
      isDismissable={!isSaving}
      isKeyboardDismissDisabled={isSaving}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Modal.Container>
        <Modal.Dialog className={styles.dialog}>
          {!isSaving && <Modal.CloseTrigger />}
          <Modal.Header>
            <Modal.Heading>
              {mode === 'add' ? 'Add MCP server' : 'Edit MCP server'}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <div className={styles.body}>
              <TextField
                className={styles.field}
                value={form.name}
                isReadOnly={mode === 'edit'}
                isInvalid={form.errors.name !== undefined}
                isDisabled={isSaving}
                onChange={form.setName}
              >
                <Label>Name</Label>
                <Input placeholder='filesystem' />
                <Description>
                  Lowercase letters, digits, and dashes. Namespaces its tools as
                  mcp__&lt;name&gt;__.
                </Description>
                {form.errors.name !== undefined && (
                  <FieldError>{form.errors.name}</FieldError>
                )}
              </TextField>

              <div className={styles.field}>
                <Label>Transport</Label>
                <ToggleButtonGroup
                  aria-label='Transport'
                  selectionMode='single'
                  disallowEmptySelection
                  isDisabled={isSaving}
                  selectedKeys={new Set([form.transportType])}
                  onSelectionChange={(keys) => {
                    const next = [...keys][0];
                    if (next === 'stdio' || next === 'http') {
                      form.setTransportType(next);
                    }
                  }}
                >
                  <ToggleButton id='stdio'>stdio</ToggleButton>
                  <ToggleButton id='http'>Streamable HTTP</ToggleButton>
                </ToggleButtonGroup>
              </div>

              {form.transportType === 'stdio' ? (
                <>
                  <TextField
                    className={styles.field}
                    value={form.command}
                    isInvalid={form.errors.command !== undefined}
                    isDisabled={isSaving}
                    onChange={form.setCommand}
                  >
                    <Label>Command</Label>
                    <Input placeholder='npx' />
                    {form.errors.command !== undefined && (
                      <FieldError>{form.errors.command}</FieldError>
                    )}
                  </TextField>

                  <div className={styles.field}>
                    <Label>Arguments</Label>
                    <StringListEditor
                      items={form.args}
                      onChange={form.setArgs}
                      addLabel='Add argument'
                      placeholder='-y'
                      isDisabled={isSaving}
                    />
                  </div>

                  <div className={styles.field}>
                    <Label>Environment variables</Label>
                    <KeyValueEditor
                      entries={form.envEntries}
                      onChange={form.setEnvEntries}
                      addLabel='Add variable'
                      keyPlaceholder='NAME'
                      valuePlaceholder='value'
                      isDisabled={isSaving}
                    />
                  </div>
                </>
              ) : (
                <>
                  <TextField
                    className={styles.field}
                    value={form.url}
                    isInvalid={form.errors.url !== undefined}
                    isDisabled={isSaving}
                    onChange={form.setUrl}
                  >
                    <Label>URL</Label>
                    <Input placeholder='https://mcp.example.com/mcp' />
                    {form.errors.url !== undefined && (
                      <FieldError>{form.errors.url}</FieldError>
                    )}
                  </TextField>

                  <div className={styles.field}>
                    <Label>Headers</Label>
                    <KeyValueEditor
                      entries={form.headerEntries}
                      onChange={form.setHeaderEntries}
                      addLabel='Add header'
                      keyPlaceholder='Authorization'
                      valuePlaceholder='Bearer …'
                      isDisabled={isSaving}
                    />
                    <p className={styles.note}>
                      Static headers only (bearer token / API key). No OAuth.
                    </p>
                  </div>
                </>
              )}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button slot='close' variant='ghost' isDisabled={isSaving}>
              Cancel
            </Button>
            <Button variant='primary' isDisabled={isSaving} onPress={onSubmit}>
              {isSaving ? (
                <Spinner size='sm' />
              ) : mode === 'add' ? (
                'Add'
              ) : (
                'Save'
              )}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
```

Create `index.ts`:

```ts
export {ServerFormModal} from './ServerFormModal.js';
```

Create `styles.module.css`:

```css
.dialog {
  width: 100%;
  max-width: 560px;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.note {
  font-size: 12px;
  color: var(--foreground-secondary, var(--foreground));
  opacity: 0.7;
}
```

- [ ] **Step 5: Run — green**

Run: `pnpm --filter @omnicraft/frontend test -- src/pages/settings/sections/mcp/servers/components/ServerFormModal/ServerFormModal.test.tsx`
Expected: PASS (3 tests).

> If the `Name`/`Command` textbox can't be found by accessible name, the `Label` association differs in the installed HeroUI — verify with `get_component_docs(["TextField"])` and adjust the label wiring; the behavior (submit yields the server, duplicate blocks) is what must hold.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/settings/sections/mcp/servers/components/ServerFormModal
git commit -m "feat(frontend): add ServerFormModal add/edit dialog"
```

---

Next: [Part 4 — card + list](./part-4-card-and-list.md)
