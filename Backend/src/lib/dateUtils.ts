const TIMEZONE = process.env.TZ || 'America/Santiago';

export function getTodayStr(): string {
    // Returns "YYYY-MM-DD" for the target timezone
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
}

function getOffsetString(dateStr: string): string {
    const targetDate = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        timeZoneName: 'shortOffset',
        hour12: false
    }).formatToParts(targetDate);

    let offset = parts.find(p => p.type === 'timeZoneName')?.value || '';
    if (offset.startsWith('GMT')) {
        offset = offset.replace('GMT', '');
    }
    if (!offset) {
        return 'Z';
    }
    const isNegative = offset.startsWith('-');
    const parts2 = offset.replace('-', '').replace('+', '').split(':');
    const hours = parts2[0].padStart(2, '0');
    const minutes = (parts2[1] || '0').padStart(2, '0');
    return `${isNegative ? '-' : '+'}${hours}:${minutes}`;
}

export function getStartOfDay(dateStr: string): Date {
    const offset = getOffsetString(dateStr);
    return new Date(`${dateStr}T00:00:00${offset}`);
}

export function getEndOfDay(dateStr: string): Date {
    const offset = getOffsetString(dateStr);
    return new Date(`${dateStr}T23:59:59.999${offset}`);
}
