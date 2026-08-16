const SGT = 'Asia/Singapore';

const HAS_ZONE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const NAIVE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** FastAPI `utcnow().isoformat()` is UTC with no zone. Treat that as UTC. */
function parseInstant(iso: string): Date {
  const trimmed = iso.trim();
  if (NAIVE_ISO.test(trimmed) && !HAS_ZONE.test(trimmed)) {
    return new Date(`${trimmed}Z`);
  }
  return new Date(trimmed);
}

function formatInSgt(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SGT,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}`;
}

/** DD-MMM-YYYY HH:mm in SGT, e.g. 16-Aug-2026 14:05 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = parseInstant(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return formatInSgt(date);
}

/** File mtime from `stat` is already a wall clock on the node (usually SGT). */
export function formatFileTime(raw: string | null | undefined): string {
  if (!raw) return '—';
  const trimmed = raw.trim();
  if (HAS_ZONE.test(trimmed) || /[+-]\d{2}/.test(trimmed)) {
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) return formatInSgt(date);
  }
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return trimmed;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Number.parseInt(match[2], 10) - 1];
  if (!month) return trimmed;
  return `${match[3]}-${month}-${match[1]} ${match[4]}:${match[5]}`;
}
