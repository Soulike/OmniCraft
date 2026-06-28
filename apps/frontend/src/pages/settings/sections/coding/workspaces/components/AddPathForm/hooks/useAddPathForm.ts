import type {Workspace} from '@omnicraft/settings-schema';
import {useCallback, useState} from 'react';

export function useAddPathForm(onAdd: (entry: Workspace) => void) {
  const [newPath, setNewPath] = useState('');

  const handleAdd = useCallback(() => {
    const trimmed = newPath.trim();
    if (!trimmed) return;
    onAdd({path: trimmed});
    setNewPath('');
  }, [newPath, onAdd]);

  return {
    newPath,
    setNewPath,
    handleAdd,
  };
}
