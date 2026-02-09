-- Fix: Honours unique constraint
-- The original UNIQUE(tournament_id, prize_type) prevented multiple awards of same type.
-- A constraint including sort_order would break on default sort_order=0.
-- Remove the constraint entirely -- application logic handles uniqueness where needed.

ALTER TABLE honours DROP CONSTRAINT IF EXISTS honours_tournament_prize_unique;
ALTER TABLE honours DROP CONSTRAINT IF EXISTS honours_tournament_prize_sort_unique;
