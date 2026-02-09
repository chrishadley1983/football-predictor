-- Fix CR-050: Add missing database indexes for common query patterns

-- Foreign key lookups
CREATE INDEX IF NOT EXISTS idx_groups_tournament_id ON groups(tournament_id);
CREATE INDEX IF NOT EXISTS idx_group_teams_group_id ON group_teams(group_id);
CREATE INDEX IF NOT EXISTS idx_group_teams_team_id ON group_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_group_results_group_id ON group_results(group_id);
CREATE INDEX IF NOT EXISTS idx_group_matches_group_id ON group_matches(group_id);

-- Player lookups
CREATE INDEX IF NOT EXISTS idx_players_auth_user_id ON players(auth_user_id);

-- Tournament entries lookups
CREATE INDEX IF NOT EXISTS idx_tournament_entries_tournament_id ON tournament_entries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_player_id ON tournament_entries(player_id);

-- Prediction lookups
CREATE INDEX IF NOT EXISTS idx_group_predictions_entry_id ON group_predictions(entry_id);
CREATE INDEX IF NOT EXISTS idx_group_predictions_group_id ON group_predictions(group_id);
CREATE INDEX IF NOT EXISTS idx_knockout_predictions_entry_id ON knockout_predictions(entry_id);
CREATE INDEX IF NOT EXISTS idx_knockout_predictions_match_id ON knockout_predictions(match_id);

-- Knockout matches
CREATE INDEX IF NOT EXISTS idx_knockout_matches_tournament_id ON knockout_matches(tournament_id);

-- Chat messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_tournament_id ON chat_messages(tournament_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_player_id ON chat_messages(player_id);

-- Posts
CREATE INDEX IF NOT EXISTS idx_posts_tournament_id ON posts(tournament_id);

-- Honours
CREATE INDEX IF NOT EXISTS idx_honours_tournament_id ON honours(tournament_id);
CREATE INDEX IF NOT EXISTS idx_honours_player_id ON honours(player_id);
