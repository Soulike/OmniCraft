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
