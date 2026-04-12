import {useMemo} from 'react';

import {GetCurrentTimeResultView} from './GetCurrentTimeResultView.js';

interface GetCurrentTimeResultProps {
  iso: string;
}

export function GetCurrentTimeResult({iso}: GetCurrentTimeResultProps) {
  const formatted = useMemo(() => {
    const date = new Date(iso);
    return {
      date: new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date),
      time: new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      }).format(date),
    };
  }, [iso]);

  return (
    <GetCurrentTimeResultView
      date={formatted.date}
      iso={iso}
      time={formatted.time}
    />
  );
}
