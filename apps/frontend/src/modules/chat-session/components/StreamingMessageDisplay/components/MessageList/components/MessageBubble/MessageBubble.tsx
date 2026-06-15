import {useDeferredValue} from 'react';

import {useStreamingText} from '@/hooks/useStreamingText.js';
import {useTheme} from '@/hooks/useTheme.js';

import type {ChatMessage} from '../../../../types.js';
import {MessageBubbleView} from './MessageBubbleView.js';

interface MessageBubbleProps {
  role: ChatMessage['role'];
  id: string | null;
  content: string;
}

export function MessageBubble({
  role,
  id: _id, // Reserved for future message editing
  content,
}: MessageBubbleProps) {
  const {resolvedTheme} = useTheme();
  const {displayedContent} = useStreamingText(content);
  const displayContent = role === 'assistant' ? displayedContent : content;
  const deferredContent = useDeferredValue(displayContent);

  return (
    <MessageBubbleView
      role={role}
      content={deferredContent}
      theme={resolvedTheme}
    />
  );
}
