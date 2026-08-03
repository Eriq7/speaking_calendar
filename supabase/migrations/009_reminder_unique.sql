-- Guarantee a reminder occurrence can never exist twice, regardless of any
-- upstream bug in the expand/backfill dedup logic (root cause of the
-- duplicate-reminder incident: backfill compared fire_at as raw strings from
-- two different formatters, which never matched, so every weekly run
-- re-inserted the whole series).
--
-- Requires existing duplicate rows to already be removed (one-time cleanup
-- run before this migration was applied) — a unique index cannot be created
-- over data that violates it.
CREATE UNIQUE INDEX IF NOT EXISTS reminders_event_kind_fire_uidx
  ON public.reminders (event_id, kind, fire_at);
