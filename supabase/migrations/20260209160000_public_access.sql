-- Allow public (unauthenticated) read access to key tables
CREATE POLICY "tournaments_select_anon" ON tournaments FOR SELECT TO anon USING (true);
CREATE POLICY "teams_select_anon" ON teams FOR SELECT TO anon USING (true);
CREATE POLICY "honours_select_anon" ON honours FOR SELECT TO anon USING (true);
CREATE POLICY "posts_select_anon" ON posts FOR SELECT TO anon USING (is_published = true);
CREATE POLICY "groups_select_anon" ON groups FOR SELECT TO anon USING (true);
CREATE POLICY "group_teams_select_anon" ON group_teams FOR SELECT TO anon USING (true);
CREATE POLICY "knockout_matches_select_anon" ON knockout_matches FOR SELECT TO anon USING (true);
CREATE POLICY "knockout_round_config_select_anon" ON knockout_round_config FOR SELECT TO anon USING (true);
CREATE POLICY "players_select_anon" ON players FOR SELECT TO anon USING (true);
CREATE POLICY "tournament_entries_select_anon" ON tournament_entries FOR SELECT TO anon USING (
  EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_entries.tournament_id AND t.status NOT IN ('draft', 'group_stage_open'))
);
