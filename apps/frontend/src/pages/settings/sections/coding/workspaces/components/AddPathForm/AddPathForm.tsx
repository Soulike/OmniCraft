import type {Workspace} from '@omnicraft/settings-schema';

import {AddPathFormView} from './AddPathFormView.js';
import {useAddPathForm} from './hooks/useAddPathForm.js';

interface AddPathFormProps {
  onAdd: (entry: Workspace) => void;
  isSaving: boolean;
}

export function AddPathForm({onAdd, isSaving}: AddPathFormProps) {
  const {newPath, setNewPath, handleAdd} = useAddPathForm(onAdd);

  return (
    <AddPathFormView
      newPath={newPath}
      isSaving={isSaving}
      onPathChange={setNewPath}
      onAdd={handleAdd}
    />
  );
}
