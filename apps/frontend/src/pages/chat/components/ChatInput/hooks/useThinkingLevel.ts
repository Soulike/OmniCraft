import type {ThinkingLevel} from '@omnicraft/api-schema';
import {useState} from 'react';

export function useThinkingLevel() {
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>('none');

  return {thinkingLevel, setThinkingLevel};
}
