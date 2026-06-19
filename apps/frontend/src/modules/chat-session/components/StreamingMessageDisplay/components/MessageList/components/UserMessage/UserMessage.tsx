import {useDeferredValue} from 'react';

import {UserMessageView} from './UserMessageView.js';

interface UserMessageProps {
  id: string | null;
  content: string;
}

export function UserMessage({
  id: _id, // Reserved for future message editing
  content,
}: UserMessageProps) {
  const deferredContent = useDeferredValue(content);

  return <UserMessageView content={deferredContent} />;
}
