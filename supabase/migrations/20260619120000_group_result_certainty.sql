-- ============================================================================
-- Group-result certainty
-- ----------------------------------------------------------------------------
-- Points and colour-coding are only awarded once an outcome is mathematically
-- GUARANTEED. group_results already carries `qualified` (now meaning "clinched
-- a knockout place") and `final_position` (the current/known standing). These
-- two flags capture the rest of the certainty so the UI + scoring can tell
-- green (exact place locked) from yellow (qualified) from red (eliminated).
-- ============================================================================

ALTER TABLE group_results
  ADD COLUMN IF NOT EXISTS position_certain BOOLEAN NOT NULL DEFAULT false, -- exact final_position is locked
  ADD COLUMN IF NOT EXISTS eliminated       BOOLEAN NOT NULL DEFAULT false; -- guaranteed NOT to advance
