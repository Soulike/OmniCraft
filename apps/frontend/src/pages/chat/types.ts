/** A chat message for UI rendering. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
