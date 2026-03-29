import type {ChatMessage} from '../../../../types.js';
import {useStreamingText} from './hooks/useStreamingText.js';
import {MessageBubbleView} from './MessageBubbleView.js';

interface MessageBubbleProps {
  role: ChatMessage['role'];
  content: string;
}

export function MessageBubble({role, content}: MessageBubbleProps) {
  const {displayedContent} = useStreamingText(content);

  const displayContent = role === 'assistant' ? displayedContent : content;

  return <MessageBubbleView role={role} content={displayContent} />;
}
