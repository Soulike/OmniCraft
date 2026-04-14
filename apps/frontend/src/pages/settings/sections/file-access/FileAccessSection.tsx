import {FileAccessSectionView} from './FileAccessSectionView.js';
import {useAllowedPaths} from './hooks/useAllowedPaths.js';

export function FileAccessSection() {
  const {
    paths,
    isLoading,
    loadError,
    isSaving,
    invalidPaths,
    addPath,
    removePath,
    reload,
  } = useAllowedPaths();

  return (
    <FileAccessSectionView
      paths={paths}
      isLoading={isLoading}
      loadError={loadError}
      isSaving={isSaving}
      invalidPaths={invalidPaths}
      onAdd={addPath}
      onRemove={removePath}
      onRetry={() => {
        void reload();
      }}
    />
  );
}
