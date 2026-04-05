import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {useCallback, useState} from 'react';

export function useAddPathForm(onAdd: (entry: AllowedPathEntry) => void) {
  const [newPath, setNewPath] = useState('');
  const [newMode, setNewMode] = useState<'read' | 'read-write'>('read');

  const handleAdd = useCallback(() => {
    const trimmed = newPath.trim();
    if (!trimmed) return;
    onAdd({path: trimmed, mode: newMode});
    setNewPath('');
    setNewMode('read');
  }, [newPath, newMode, onAdd]);

  const handleModeChange = useCallback((value: string) => {
    if (value === 'read' || value === 'read-write') {
      setNewMode(value);
    }
  }, []);

  return {
    newPath,
    newMode,
    setNewPath,
    handleModeChange,
    handleAdd,
  };
}
