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
