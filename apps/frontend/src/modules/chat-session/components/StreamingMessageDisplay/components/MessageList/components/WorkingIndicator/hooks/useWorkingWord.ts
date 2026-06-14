import {useState} from 'react';

import {pickWorkingWord} from '../words.js';

/** Picks a working word once on mount and keeps it stable. */
export function useWorkingWord(): string {
  // Pick once on mount and keep it stable for this placeholder's lifetime.
  const [word] = useState(pickWorkingWord);
  return word;
}
