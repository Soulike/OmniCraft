import {useWorkingWord} from './hooks/useWorkingWord.js';
import {WorkingIndicatorView} from './WorkingIndicatorView.js';

export function WorkingIndicator() {
  const word = useWorkingWord();

  return <WorkingIndicatorView word={word} />;
}
