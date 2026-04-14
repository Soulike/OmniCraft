import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {AddPathFormView} from './AddPathFormView.js';
import {useAddPathForm} from './hooks/useAddPathForm.js';

interface AddPathFormProps {
  onAdd: (entry: AllowedPathEntry) => void;
  isSaving: boolean;
}

export function AddPathForm({onAdd, isSaving}: AddPathFormProps) {
  const {newPath, newMode, setNewPath, handleModeChange, handleAdd} =
    useAddPathForm(onAdd);

  return (
    <AddPathFormView
      newPath={newPath}
      newMode={newMode}
      isSaving={isSaving}
      onPathChange={setNewPath}
      onModeChange={handleModeChange}
      onAdd={handleAdd}
    />
  );
}
