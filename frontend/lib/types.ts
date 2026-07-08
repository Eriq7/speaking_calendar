export interface EventInput {
  title: string;
  note: string | null;
  date: string;
  time: string | null;
  location: string | null;
  early_reminder: number | null;
  rrule: string | null;
  repeat_end_date: string | null;
  color: string;
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
  days_before: number | null;
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

// DBEvent enriched with the specific reminder occurrence for DetailModal display.
export interface DetailEvent extends DBEvent {
  reminderId: string | null;      // null only if no day-of reminder found for this date
  reminderCompleted: boolean;
  isOverdue: boolean;             // date < today && !reminderCompleted
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
