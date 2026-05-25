export default function getLocalISO(date: Date = new Date()): string {
    return date.toISOString();
}
