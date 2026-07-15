-- Add excluded_dates to events so individual occurrences of a recurring event
-- can be deleted without affecting the rest of the series (P5).
-- The backfill Edge Function and expand.ts both skip dates in this array.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS excluded_dates date[] NOT NULL DEFAULT '{}';
