-- Add stadium name to fixtures. The existing `venue` column holds the FIFA
-- host-city label (e.g. "New York/New Jersey"); `stadium` holds the venue name
-- (e.g. "MetLife Stadium"). Applied to both group and knockout matches.
ALTER TABLE group_matches ADD COLUMN IF NOT EXISTS stadium TEXT;
ALTER TABLE knockout_matches ADD COLUMN IF NOT EXISTS stadium TEXT;
