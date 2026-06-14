import {useState} from 'react';

import {pickWorkingWord} from './words.js';
import {WorkingIndicatorView} from './WorkingIndicatorView.js';

export function WorkingIndicator() {
  // Pick once on mount and keep it stable for this placeholder's lifetime.
  const [word] = useState(pickWorkingWord);

  return <WorkingIndicatorView word={word} />;
}
