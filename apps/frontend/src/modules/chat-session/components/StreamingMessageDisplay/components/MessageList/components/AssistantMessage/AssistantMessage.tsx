import {useDeferredValue} from 'react';

import {useStreamingText} from '@/hooks/useStreamingText.js';
import {useTheme} from '@/hooks/useTheme.js';

import {AssistantMessageView} from './AssistantMessageView.js';

interface AssistantMessageProps {
  id: string | null;
  content: string;
}

export function AssistantMessage({
  id: _id, // Reserved for future message editing
  content,
}: AssistantMessageProps) {
  const {resolvedTheme} = useTheme();
  const {displayedContent} = useStreamingText(content);
  const deferredContent = useDeferredValue(displayedContent);

  return (
    <AssistantMessageView content={deferredContent} theme={resolvedTheme} />
  );
}
