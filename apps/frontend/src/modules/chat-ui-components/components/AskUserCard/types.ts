/** A question rendered by the ask_user card. Presentation shape only — the
 *  tool's own parameter schema lives in the chat-stream connector. */
export interface AskUserQuestion {
  question: string;
  options: readonly string[];
}

/** A collected answer to one question. `answer` is null when left blank. */
export interface AskUserAnswer {
  question: string;
  answer: string | null;
}
