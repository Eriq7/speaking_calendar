import type { UpcomingReminder, UpcomingGroup, DBEvent } from "./types";
import { isoToLocalDateString } from "./date";
import { repeatSummary as getRepeatSummary } from "./repeat";

/**
 * Collapse an already-sorted (fire_at asc) list of upcoming reminders into
 * display groups, then further collapse repeating events to a single card.
 *
 * Two reminder rows belong to the same group when they share the same
 * (event_id, local fire-date, event time).  This merges a "3 hours before"
 * early row and a day-of row that both display "Jul 14 · 7:00 PM" into a
 * single card.  Cross-day offsets ("1 day before") produce a different local
 * fire-date and therefore remain separate cards.
 *
 * For events with an rrule, only the earliest group (next occurrence) is kept;
 * subsequent occurrences are collapsed away so the list stays concise.
 */
export function groupUpcoming(
  upcoming: UpcomingReminder[],
  eventsMap: Map<string, DBEvent>
): UpcomingGroup[] {
  const map = new Map<string, UpcomingGroup>();
  const order: string[] = [];

  for (const r of upcoming) {
    const localDate = isoToLocalDateString(r.fire_at);
    const key = `${r.event_id}|${localDate}|${r.time ?? ""}`;

    if (!map.has(key)) {
      const ev = eventsMap.get(r.event_id);
      map.set(key, {
        key,
        representative: r,
        ids: [r.id],
        hasEarly: r.kind === "early",
        sortFireAt: r.fire_at,
        repeatSummary: ev ? getRepeatSummary(ev.rrule, ev.repeat_end_date) : null,
        occurrenceDate: r.kind === "day-of" ? localDate : null,
      });
      order.push(key);
    } else {
      const g = map.get(key)!;
      g.ids.push(r.id);
      if (r.kind === "early") g.hasEarly = true;
      // Prefer the day-of row as representative (canonical event time).
      if (r.kind === "day-of") {
        g.representative = r;
        g.occurrenceDate = localDate;
      }
    }
  }

  const groups = order.map((k) => map.get(k)!);

  // Collapse repeating events: keep only the first (earliest) group per event.
  const seenRepeat = new Set<string>();
  return groups.filter((g) => {
    if (!g.repeatSummary) return true;
    if (seenRepeat.has(g.representative.event_id)) return false;
    seenRepeat.add(g.representative.event_id);
    return true;
  });
}
