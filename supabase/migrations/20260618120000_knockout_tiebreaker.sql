-- ============================================================================
-- Knockout-stage goal-total tiebreaker
-- ----------------------------------------------------------------------------
-- The knockout bracket entry captures a separate "total goals across the whole
-- knockout stage" guess, used to break ties on the knockout/overall standings
-- (distinct from the existing group-stage-goals tiebreaker on
-- tournament_entries.tiebreaker_goals).
-- ============================================================================

ALTER TABLE tournament_entries
  ADD COLUMN IF NOT EXISTS knockout_tiebreaker_goals INTEGER,
  ADD COLUMN IF NOT EXISTS knockout_tiebreaker_diff INTEGER;

-- Actual total goals scored across every knockout fixture (admin/result-sync
-- populates this; scoring compares each entry's guess against it).
ALTER TABLE tournament_stats
  ADD COLUMN IF NOT EXISTS total_knockout_goals INTEGER;

-- ----------------------------------------------------------------------------
-- Expose the new tiebreaker columns on the leaderboard view, masked before the
-- prediction window closes exactly like the other per-player columns so a
-- player's guess can't leak while entries are still editable.
-- NOTE: CREATE OR REPLACE VIEW can only APPEND columns (not reorder), so the
-- two new columns are added at the end of the select list.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW tournament_leaderboard AS
SELECT te.id AS entry_id,
    te.tournament_id,
    te.player_id,
    p.display_name,
    p.nickname,
    p.avatar_url,
    CASE WHEN t.status <> ALL (ARRAY['draft'::text, 'group_stage_open'::text]) THEN te.tiebreaker_goals ELSE NULL::integer END AS tiebreaker_goals,
    CASE WHEN t.status <> ALL (ARRAY['draft'::text, 'group_stage_open'::text]) THEN te.group_stage_points ELSE NULL::integer END AS group_stage_points,
    CASE WHEN t.status <> ALL (ARRAY['draft'::text, 'group_stage_open'::text]) THEN te.knockout_points ELSE NULL::integer END AS knockout_points,
    CASE WHEN t.status <> ALL (ARRAY['draft'::text, 'group_stage_open'::text]) THEN te.total_points ELSE NULL::integer END AS total_points,
    CASE WHEN t.status <> ALL (ARRAY['draft'::text, 'group_stage_open'::text]) THEN te.tiebreaker_diff ELSE NULL::integer END AS tiebreaker_diff,
    CASE WHEN t.status <> ALL (ARRAY['draft'::text, 'group_stage_open'::text]) THEN te.group_stage_rank ELSE NULL::integer END AS group_stage_rank,
    CASE WHEN t.status <> ALL (ARRAY['draft'::text, 'group_stage_open'::text]) THEN te.overall_rank ELSE NULL::integer END AS overall_rank,
    t.status AS tournament_status,
    CASE WHEN t.status <> ALL (ARRAY['draft'::text, 'group_stage_open'::text]) THEN te.knockout_tiebreaker_goals ELSE NULL::integer END AS knockout_tiebreaker_goals,
    CASE WHEN t.status <> ALL (ARRAY['draft'::text, 'group_stage_open'::text]) THEN te.knockout_tiebreaker_diff ELSE NULL::integer END AS knockout_tiebreaker_diff
   FROM tournament_entries te
     JOIN players p ON p.id = te.player_id
     JOIN tournaments t ON t.id = te.tournament_id;
