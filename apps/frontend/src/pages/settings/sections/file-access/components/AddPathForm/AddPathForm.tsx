import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {AddPathFormView} from './AddPathFormView.js';
import {useAddPathForm} from './hooks/useAddPathForm.js';

interface AddPathFormProps {
  onAdd: (entry: AllowedPathEntry) => void;
}

export function AddPathForm({onAdd}: AddPathFormProps) {
  const {newPath, newMode, setNewPath, handleModeChange, handleAdd} =
    useAddPathForm(onAdd);

  return (
    <AddPathFormView
      newPath={newPath}
      newMode={newMode}
      onPathChange={setNewPath}
      onModeChange={handleModeChange}
      onAdd={handleAdd}
    />
  );
}
