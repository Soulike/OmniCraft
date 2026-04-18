import {useCallback, useState} from 'react';

import {SessionItemView} from './SessionItemView.js';

interface SessionItemProps {
  title: string;
  onDelete: () => Promise<void>;
}

export function SessionItem({title, onDelete}: SessionItemProps) {
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
      isDeleteOpen={isDeleteOpen}
      onDeleteOpenChange={setIsDeleteOpen}
      onConfirmDelete={() => {
        void handleConfirmDelete();
      }}
      isDeleting={isDeleting}
    />
  );
}
