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
  const [envEntries, setEnvEntries] = useState<[string, string][]>(() =>
    initialTransport?.type === 'stdio'
      ? recordToPairs(initialTransport.env)
      : [],
  );
  const [url, setUrl] = useState(
    initialTransport?.type === 'http' ? initialTransport.url : '',
  );
  const [headerEntries, setHeaderEntries] = useState<[string, string][]>(() =>
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
