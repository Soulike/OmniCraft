import type {ChatMessage} from '../../../../types.js';
import {useStreamingText} from './hooks/useStreamingText.js';
import {MessageBubbleView} from './MessageBubbleView.js';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({message}: MessageBubbleProps) {
  const {displayedContent} = useStreamingText(message.content);

  const content =
    message.role === 'assistant' ? displayedContent : message.content;

  return <MessageBubbleView role={message.role} content={content} />;
}
