// Local-date helpers. INV-12: "before today" coloring is computed purely on the
// frontend from the live `new Date()`, never from the backend.

export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayLocalString(): string {
  return toLocalDateString(new Date());
}

export function nowLocalString(): string {
  const d = new Date();
  const date = toLocalDateString(d);
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${date}T${h}:${min}`;
}

// Local date string of an ISO-8601 UTC timestamp, in the browser's timezone.
export function isoToLocalDateString(iso: string): string {
  return toLocalDateString(new Date(iso));
}

export function getLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatFriendlyDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD (local). Parse without timezone shift.
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function formatTime(time: string | null): string {
  if (!time) return "All day";
  const [h, min] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
}
