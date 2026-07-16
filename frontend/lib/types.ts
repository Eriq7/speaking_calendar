export type EarlyUnit = "minute" | "hour" | "day" | "week" | "month";

export interface EventInput {
  title: string;
  note: string | null;
  date: string;
  time: string | null;
  location: string | null;
  early_value: number | null;
  early_unit: EarlyUnit | null;
  rrule: string | null;
  repeat_end_date: string | null;
  color: string;
  /** Occurrence dates (YYYY-MM-DD) that have been individually deleted. */
  excluded_dates?: string[];
}

export interface DBEvent extends EventInput {
  id: string;
  created_at: string;
}

export type ReminderKind = "day-of" | "early";

export interface DBReminder {
  id: string;
  event_id: string;
  fire_at: string;
  kind: ReminderKind;
  days_before: number | null;  // legacy; prefer early_value/early_unit
  early_value: number | null;
  early_unit: string | null;
  sent: boolean;
  completed: boolean; // user-acknowledged; independent of sent (push delivery)
  title: string;
  time: string | null;
  location: string | null;
  color: string;
}

export interface UpcomingReminder {
  id: string;
  event_id: string;
  fire_at: string;
  title: string;
  time: string | null;
  location: string | null;
  color: string;
  kind: ReminderKind;
  completed: boolean;
}

// One card in the Coming up list — may represent multiple DB reminders for the
// same occurrence (e.g. an early + a day-of row for the same event at the same
// local date/time).  All ids are completed together so neither row lingers.
export interface UpcomingGroup {
  /** `${event_id}|${localFireDate}|${time ?? ""}` */
  key: string;
  /** day-of row when present, otherwise the early row. Used for display + detail modal. */
  representative: UpcomingReminder;
  /** every reminder id in the group — PATCHed together on complete / undo */
  ids: string[];
  /** true if any member has kind === "early" → renders "· early reminder" label */
  hasEarly: boolean;
  /** min(fire_at) across the group — already the natural sort order */
  sortFireAt: string;
  /** Human-readable repeat summary, e.g. "Repeats weekly until Aug 30, 2026". Null for non-repeating. */
  repeatSummary: string | null;
  /** The actual event occurrence date (YYYY-MM-DD) for this card — used for occurrence deletion. */
  occurrenceDate: string | null;
}

// DBEvent enriched with the specific reminder occurrence for DetailModal display.
export interface DetailEvent extends DBEvent {
  reminderId: string | null;      // null only if no day-of reminder found for this date
  reminderCompleted: boolean;
  isOverdue: boolean;             // date < today && !reminderCompleted
  occurrenceDate: string | null;  // the specific occurrence date (YYYY-MM-DD) shown in this modal
}

// GET /api/events response
export interface EventsResponse {
  events: DBEvent[];
  reminders: DBReminder[];
  upcoming: UpcomingReminder[];
}

// POST /api/parse
export interface ParseRequest {
  text: string;
  timezone: string;
  today: string;
  now: string; // local YYYY-MM-DDTHH:mm — used to resolve relative-time expressions
}
export interface ParseResponse {
  events: EventInput[];
}

// POST /api/events
export interface CreateEventsRequest {
  events: EventInput[];
  timezone: string;
}
export interface CreateEventsResponse {
  eventIds: string[];
}

// GET/PUT /api/settings
export interface Settings {
  user_name: string;
  butler_name: string;
  timezone: string;
}
