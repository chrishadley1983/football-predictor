-- Expand honours table for historical data and fun awards

-- Make player_id nullable (for historical players without accounts)
ALTER TABLE honours ALTER COLUMN player_id DROP NOT NULL;

-- Add player_name for historical records
ALTER TABLE honours ADD COLUMN player_name TEXT;

-- Add description for fun award context
ALTER TABLE honours ADD COLUMN description TEXT;

-- Add points scored (for context)
ALTER TABLE honours ADD COLUMN points INTEGER;

-- Add sort_order for display ordering within a tournament
ALTER TABLE honours ADD COLUMN sort_order INTEGER DEFAULT 0;

-- Drop the old restrictive CHECK constraint on prize_type
ALTER TABLE honours DROP CONSTRAINT IF EXISTS honours_prize_type_check;

-- Add expanded prize_type CHECK
ALTER TABLE honours ADD CONSTRAINT honours_prize_type_check CHECK (
  prize_type IN (
    'overall_winner',
    'runner_up',
    'third_place',
    'group_stage_winner',
    'knockout_stage_winner',
    'best_tiebreaker',
    'wooden_spoon',
    'worst_tiebreaker',
    'hipster',
    'bandwagon',
    'nearly_man',
    'custom'
  )
);

-- Drop the old UNIQUE constraint (we want multiple awards per tournament)
ALTER TABLE honours DROP CONSTRAINT IF EXISTS honours_tournament_id_prize_type_key;

-- Add new UNIQUE constraint that allows multiple awards but not duplicates
ALTER TABLE honours ADD CONSTRAINT honours_tournament_prize_unique UNIQUE (tournament_id, prize_type);
