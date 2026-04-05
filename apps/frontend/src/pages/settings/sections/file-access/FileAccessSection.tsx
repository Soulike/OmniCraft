import {FileAccessSectionView} from './FileAccessSectionView.js';
import {useFileAccessSection} from './hooks/useFileAccessSection.js';

export function FileAccessSection() {
  const {
    paths,
    isLoading,
    loadError,
    isSaving,
    saveError,
    invalidPaths,
    addPath,
    removePath,
    onSave,
    onRetry,
  } = useFileAccessSection();

  return (
    <FileAccessSectionView
      paths={paths}
      isLoading={isLoading}
      loadError={loadError}
      isSaving={isSaving}
      saveError={saveError}
      invalidPaths={invalidPaths}
      onAdd={addPath}
      onRemove={removePath}
      onSave={onSave}
      onRetry={onRetry}
    />
  );
}
