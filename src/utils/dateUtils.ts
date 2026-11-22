export const formatMatchTime = (dateString: string) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const time = date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    
    return `${time} | ${day} ${month}`;
  } catch (e) {
    return dateString;
  }
};

export const formatUserDateTime = (value: any, fallback = 'Not recorded'): string => {
  if (!value) return fallback;
  try {
    let date: Date | null = null;
    if (typeof value?.toDate === 'function') {
      date = value.toDate();
    } else if (typeof value?.seconds === 'number') {
      date = new Date(value.seconds * 1000);
    } else if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'string' || typeof value === 'number') {
      date = new Date(value);
    }

    if (!date || isNaN(date.getTime())) return fallback;

    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return fallback;
  }
};
