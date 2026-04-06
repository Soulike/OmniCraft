const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Formats a Unix ms timestamp for display. Same day: "HH:mm". Other day: "M月D日 HH:mm". */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  if (isSameDay(date, now)) {
    return timeFormat.format(date);
  }

  return dateTimeFormat.format(date);
}
