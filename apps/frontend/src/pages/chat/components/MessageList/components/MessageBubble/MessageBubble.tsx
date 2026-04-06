import {useDeferredValue} from 'react';

import type {ChatMessage} from '../../../../types.js';
import {useStreamingText} from './hooks/useStreamingText.js';
import {MessageBubbleView} from './MessageBubbleView.js';

interface MessageBubbleProps {
  role: ChatMessage['role'];
  id: string | null;
  content: string;
}

export function MessageBubble({role, id: _id, content}: MessageBubbleProps) {
  const {displayedContent} = useStreamingText(content);
  const displayContent = role === 'assistant' ? displayedContent : content;
  const deferredContent = useDeferredValue(displayContent);

  return <MessageBubbleView role={role} content={deferredContent} />;
}
