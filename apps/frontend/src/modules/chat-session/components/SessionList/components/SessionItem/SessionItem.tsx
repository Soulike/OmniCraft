import {useCallback, useState} from 'react';

import {SessionItemView} from './SessionItemView.js';

interface SessionItemProps {
  title: string;
  workingDirectory: string | undefined;
  onDelete: () => Promise<void>;
}

export function SessionItem({
  title,
  workingDirectory,
  onDelete,
}: SessionItemProps) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  }, [onDelete]);

  return (
    <SessionItemView
      title={title}
      workingDirectory={workingDirectory}
      isDeleteOpen={isDeleteOpen}
      onDeleteOpenChange={setIsDeleteOpen}
      onConfirmDelete={() => {
        void handleConfirmDelete();
      }}
      isDeleting={isDeleting}
    />
  );
}
