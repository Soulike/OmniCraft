import {useEffect, useState} from 'react';

interface UseContextCompactionBlockOptions {
  status: 'in-progress' | 'done' | 'failed';
}

/** Default expansion: failed = expanded, others = collapsed. */
export function useContextCompactionBlock({
  status,
}: UseContextCompactionBlockOptions) {
  const [isExpanded, setIsExpanded] = useState(status === 'failed');

  // When transitioning into 'failed', expand. When into 'done', collapse.
  useEffect(() => {
    if (status === 'failed') setIsExpanded(true);
    else if (status === 'done') setIsExpanded(false);
  }, [status]);

  return {isExpanded, onExpandedChange: setIsExpanded};
}
