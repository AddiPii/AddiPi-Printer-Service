export default function getLocalISO(date: Date = new Date()): string {
    return new Intl.DateTimeFormat('sv-SE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
        hour12: false,
        timeZone: 'Europe/Warsaw',
    }).format(date).replace(' ', 'T') + 'Z';
}
