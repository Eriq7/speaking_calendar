import type { UpcomingReminder, UpcomingGroup } from "./types";
import { isoToLocalDateString } from "./date";

/**
 * Collapse an already-sorted (fire_at asc) list of upcoming reminders into
 * display groups.
 *
 * Two reminder rows belong to the same group when they share the same
 * (event_id, local fire-date, event time).  This merges a "3 hours before"
 * early row and a day-of row that both display "Jul 14 · 7:00 PM" into a
 * single card.  Cross-day offsets ("1 day before") produce a different local
 * fire-date and therefore remain separate cards.
 */
export function groupUpcoming(upcoming: UpcomingReminder[]): UpcomingGroup[] {
  const map = new Map<string, UpcomingGroup>();
  const order: string[] = [];

  for (const r of upcoming) {
    const localDate = isoToLocalDateString(r.fire_at);
    const key = `${r.event_id}|${localDate}|${r.time ?? ""}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        representative: r,
        ids: [r.id],
        hasEarly: r.kind === "early",
        sortFireAt: r.fire_at,
      });
      order.push(key);
    } else {
      const g = map.get(key)!;
      g.ids.push(r.id);
      if (r.kind === "early") g.hasEarly = true;
      // Prefer the day-of row as representative (canonical event time).
      if (r.kind === "day-of") g.representative = r;
    }
  }

  return order.map((k) => map.get(k)!);
}
