import {useStreamingText} from './hooks/useStreamingText.js';
import {MessageBubbleView} from './MessageBubbleView.js';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming: boolean;
}

export function MessageBubble({
  role,
  content,
  isStreaming,
}: MessageBubbleProps) {
  const {displayedContent} = useStreamingText(content);

  const displayContent =
    role === 'assistant' && isStreaming ? displayedContent : content;

  return <MessageBubbleView role={role} content={displayContent} />;
}
