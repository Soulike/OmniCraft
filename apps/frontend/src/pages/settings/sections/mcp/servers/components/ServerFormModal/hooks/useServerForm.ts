import type {McpServer, McpTransport} from '@omnicraft/settings-schema';
import {mcpServerSchema} from '@omnicraft/settings-schema';
import {useCallback, useState} from 'react';

import type {KeyValueEntry} from '@/components/KeyValueEditor/index.js';

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
  envEntries: KeyValueEntry[];
  setEnvEntries: (value: KeyValueEntry[]) => void;
  url: string;
  setUrl: (value: string) => void;
  headerEntries: KeyValueEntry[];
  setHeaderEntries: (value: KeyValueEntry[]) => void;
  errors: FormErrors;
  isEdit: boolean;
  validate: () => McpServer | null;
}

interface UseServerFormParams {
  initial?: McpServer;
  existingNames: string[];
}

function pairsToRecord(entries: KeyValueEntry[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const {key, value} of entries) {
    const trimmed = key.trim();
    if (trimmed !== '') {
      record[trimmed] = value;
    }
  }
  return record;
}

function recordToPairs(record: Record<string, string>): KeyValueEntry[] {
  return Object.entries(record).map(([key, value]) => ({key, value}));
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
  const [envEntries, setEnvEntries] = useState<KeyValueEntry[]>(() =>
    initialTransport?.type === 'stdio'
      ? recordToPairs(initialTransport.env)
      : [],
  );
  const [url, setUrl] = useState(
    initialTransport?.type === 'http' ? initialTransport.url : '',
  );
  const [headerEntries, setHeaderEntries] = useState<KeyValueEntry[]>(() =>
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
    const trimmedName = name.trim();
    const transport: McpTransport =
      transportType === 'stdio'
        ? {
            type: 'stdio',
            command: command.trim(),
            args: args.filter((arg) => arg !== ''),
            env: pairsToRecord(envEntries),
          }
        : {
            type: 'http',
            url: url.trim(),
            headers: pairsToRecord(headerEntries),
          };

    // Let the shared schema decide what is structurally valid; the hook only
    // owns the friendly copy and the cross-server duplicate check (which the
    // single-server schema cannot know about).
    const result = mcpServerSchema.safeParse({name: trimmedName, transport});
    const nextErrors: FormErrors = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const [field, subField] = issue.path;
        if (field === 'name') {
          nextErrors.name =
            'Use lowercase letters, digits, and dashes; start with a letter or digit.';
        } else if (subField === 'command') {
          nextErrors.command = 'Command is required.';
        } else if (subField === 'url') {
          nextErrors.url = 'Enter a valid URL (https://…).';
        }
      }
    } else if (existingNames.includes(trimmedName)) {
      nextErrors.name = `A server named "${trimmedName}" already exists.`;
    }

    setErrors(nextErrors);
    if (!result.success || Object.keys(nextErrors).length > 0) {
      return null;
    }
    return result.data;
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
