// ============================================================================
// Enums
// ============================================================================

export type TournamentType = 'world_cup' | 'euros'

export type TournamentStatus =
  | 'draft'
  | 'group_stage_open'
  | 'group_stage_closed'
  | 'knockout_open'
  | 'knockout_closed'
  | 'completed'

export type PaymentStatus = 'pending' | 'paid' | 'refunded'

export type KnockoutRound =
  | 'round_of_32'
  | 'round_of_16'
  | 'quarter_final'
  | 'semi_final'
  | 'final'

export type PrizeType =
  | 'overall_winner'
  | 'runner_up'
  | 'third_place'
  | 'group_stage_winner'
  | 'knockout_stage_winner'
  | 'best_tiebreaker'
  | 'wooden_spoon'
  | 'worst_tiebreaker'
  | 'hipster'
  | 'bandwagon'
  | 'nearly_man'
  | 'custom'

export type BracketSide = 'left' | 'right'

// ============================================================================
// Database row types (match column names exactly from spec)
// ============================================================================

export interface Tournament {
  id: string
  name: string
  slug: string
  type: TournamentType
  year: number
  entry_fee_gbp: number
  prize_pool_gbp: number | null
  group_stage_prize_pct: number
  overall_prize_pct: number
  group_stage_deadline: string | null
  knockout_stage_deadline: string | null
  status: TournamentStatus
  third_place_qualifiers_count: number | null
  created_at: string
  updated_at: string
}

export interface Group {
  id: string
  tournament_id: string
  name: string
  sort_order: number
}

export interface Team {
  id: string
  name: string
  code: string
  flag_emoji: string | null
  flag_url: string | null
}

export interface GroupTeam {
  id: string
  group_id: string
  team_id: string
  seed_position: number | null
}

export interface KnockoutMatch {
  id: string
  tournament_id: string
  round: KnockoutRound
  match_number: number
  bracket_side: BracketSide | null
  home_source: string | null
  away_source: string | null
  home_team_id: string | null
  away_team_id: string | null
  winner_team_id: string | null
  points_value: number
  sort_order: number
  scheduled_at: string | null
  venue: string | null
}

export interface GroupMatch {
  id: string
  group_id: string
  home_team_id: string | null
  away_team_id: string | null
  match_number: number | null
  scheduled_at: string | null
  venue: string | null
  home_score: number | null
  away_score: number | null
  sort_order: number
}

export interface Player {
  id: string
  auth_user_id: string | null
  display_name: string
  nickname: string | null
  email: string
  avatar_url: string | null
  created_at: string
}

export interface TournamentEntry {
  id: string
  tournament_id: string
  player_id: string
  payment_status: PaymentStatus
  tiebreaker_goals: number | null
  group_stage_points: number
  knockout_points: number
  total_points: number
  tiebreaker_diff: number | null
  group_stage_rank: number | null
  overall_rank: number | null
  created_at: string
}

export interface GroupPrediction {
  id: string
  entry_id: string
  group_id: string
  predicted_1st: string | null
  predicted_2nd: string | null
  predicted_3rd: string | null
  points_earned: number
  submitted_at: string
}

export interface GroupResult {
  id: string
  group_id: string
  team_id: string
  final_position: number
  qualified: boolean
}

export interface KnockoutPrediction {
  id: string
  entry_id: string
  match_id: string
  predicted_winner_id: string | null
  is_correct: boolean | null
  points_earned: number
  submitted_at: string
}

export interface TournamentStats {
  id: string
  tournament_id: string
  total_group_stage_goals: number | null
}

export interface Honours {
  id: string
  tournament_id: string
  player_id: string | null
  player_name: string | null
  prize_type: PrizeType
  prize_amount_gbp: number | null
  description: string | null
  points: number | null
  sort_order: number
}

export interface Post {
  id: string
  tournament_id: string
  title: string
  slug: string
  content: string
  author: string
  image_url: string | null
  published_at: string
  is_published: boolean
  created_at: string
}

export interface KnockoutRoundConfig {
  id: string
  tournament_id: string
  round: string
  points_value: number
  match_count: number
  sort_order: number
}

// ============================================================================
// Insert types (omit generated/default fields)
// ============================================================================

export type TournamentInsert = Omit<Tournament, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}

export type GroupInsert = Omit<Group, 'id'> & { id?: string }

export type TeamInsert = Omit<Team, 'id'> & { id?: string }

export type GroupTeamInsert = Omit<GroupTeam, 'id'> & { id?: string }

export type KnockoutMatchInsert = Omit<KnockoutMatch, 'id'> & { id?: string }

export type GroupMatchInsert = Omit<GroupMatch, 'id'> & { id?: string }

export type PlayerInsert = Omit<Player, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

export type TournamentEntryInsert = Omit<
  TournamentEntry,
  'id' | 'total_points' | 'created_at'
> & {
  id?: string
  created_at?: string
}

export type GroupPredictionInsert = Omit<GroupPrediction, 'id' | 'submitted_at'> & {
  id?: string
  submitted_at?: string
}

export type GroupResultInsert = Omit<GroupResult, 'id'> & { id?: string }

export type KnockoutPredictionInsert = Omit<KnockoutPrediction, 'id' | 'submitted_at'> & {
  id?: string
  submitted_at?: string
}

export type TournamentStatsInsert = Omit<TournamentStats, 'id'> & { id?: string }

export type HonoursInsert = Omit<Honours, 'id'> & { id?: string }

export type PostInsert = Omit<Post, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

export type KnockoutRoundConfigInsert = Omit<KnockoutRoundConfig, 'id'> & { id?: string }

// ============================================================================
// Update types (all fields optional except id)
// ============================================================================

export type TournamentUpdate = Partial<Omit<Tournament, 'id'>>
export type GroupUpdate = Partial<Omit<Group, 'id'>>
export type TeamUpdate = Partial<Omit<Team, 'id'>>
export type GroupTeamUpdate = Partial<Omit<GroupTeam, 'id'>>
export type KnockoutMatchUpdate = Partial<Omit<KnockoutMatch, 'id'>>
export type GroupMatchUpdate = Partial<Omit<GroupMatch, 'id'>>
export type PlayerUpdate = Partial<Omit<Player, 'id'>>
export type TournamentEntryUpdate = Partial<Omit<TournamentEntry, 'id' | 'total_points'>>
export type GroupPredictionUpdate = Partial<Omit<GroupPrediction, 'id'>>
export type GroupResultUpdate = Partial<Omit<GroupResult, 'id'>>
export type KnockoutPredictionUpdate = Partial<Omit<KnockoutPrediction, 'id'>>
export type TournamentStatsUpdate = Partial<Omit<TournamentStats, 'id'>>
export type HonoursUpdate = Partial<Omit<Honours, 'id'>>
export type PostUpdate = Partial<Omit<Post, 'id'>>
export type KnockoutRoundConfigUpdate = Partial<Omit<KnockoutRoundConfig, 'id'>>

// ============================================================================
// Composite / helper types
// ============================================================================

export interface GroupWithTeams extends Group {
  group_teams: (GroupTeam & { team: Team })[]
}

export interface TournamentWithGroups extends Tournament {
  groups: GroupWithTeams[]
}

export interface TournamentWithConfig extends Tournament {
  knockout_round_config: KnockoutRoundConfig[]
}

export interface GroupMatchWithTeams extends GroupMatch {
  home_team: Team | null
  away_team: Team | null
}

export interface KnockoutMatchWithTeams extends KnockoutMatch {
  home_team: Team | null
  away_team: Team | null
  winner_team: Team | null
}

export interface TournamentEntryWithPlayer extends TournamentEntry {
  player: Player
}

export interface GroupPredictionWithTeams extends GroupPrediction {
  predicted_1st_team: Team | null
  predicted_2nd_team: Team | null
  predicted_3rd_team: Team | null
}

export interface KnockoutPredictionWithMatch extends KnockoutPrediction {
  match: KnockoutMatchWithTeams
  predicted_winner: Team | null
}

export interface HonoursWithDetails extends Honours {
  tournament: Tournament
  player: Player | null
}

export interface PostWithTournament extends Post {
  tournament: Tournament
}

export interface ChatMessage {
  id: string
  tournament_id: string
  player_id: string
  content: string
  created_at: string
}

export interface ChatMessageWithPlayer extends ChatMessage {
  player: Pick<Player, 'display_name' | 'nickname' | 'avatar_url'>
}

export interface LeaderboardEntry {
  entry_id: string
  player_id: string
  display_name: string
  nickname: string | null
  avatar_url: string | null
  group_stage_points: number
  knockout_points: number
  total_points: number
  tiebreaker_goals: number | null
  tiebreaker_diff: number | null
  group_stage_rank: number | null
  overall_rank: number | null
  payment_status?: PaymentStatus
}

export interface PredictionSummary {
  entry_id: string
  player: Player
  group_predictions: (GroupPrediction & {
    group: Group
    predicted_1st_team: Team | null
    predicted_2nd_team: Team | null
    predicted_3rd_team: Team | null
  })[]
  knockout_predictions: (KnockoutPrediction & {
    match: KnockoutMatch
    predicted_winner: Team | null
  })[]
}

// ============================================================================
// Supabase Database type (for typed client)
// ============================================================================

export interface Database {
  public: {
    Tables: {
      tournaments: {
        Row: {
          id: string
          name: string
          slug: string
          type: TournamentType
          year: number
          entry_fee_gbp: number
          prize_pool_gbp: number | null
          group_stage_prize_pct: number
          overall_prize_pct: number
          group_stage_deadline: string | null
          knockout_stage_deadline: string | null
          status: TournamentStatus
          third_place_qualifiers_count: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          type: TournamentType
          year: number
          entry_fee_gbp?: number
          prize_pool_gbp?: number | null
          group_stage_prize_pct?: number
          overall_prize_pct?: number
          group_stage_deadline?: string | null
          knockout_stage_deadline?: string | null
          status?: TournamentStatus
          third_place_qualifiers_count?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          slug?: string
          type?: TournamentType
          year?: number
          entry_fee_gbp?: number
          prize_pool_gbp?: number | null
          group_stage_prize_pct?: number
          overall_prize_pct?: number
          group_stage_deadline?: string | null
          knockout_stage_deadline?: string | null
          status?: TournamentStatus
          third_place_qualifiers_count?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          tournament_id: string
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          tournament_id: string
          name: string
          sort_order: number
        }
        Update: {
          tournament_id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'groups_tournament_id_fkey'
            columns: ['tournament_id']
            isOneToOne: false
            referencedRelation: 'tournaments'
            referencedColumns: ['id']
          },
        ]
      }
      teams: {
        Row: {
          id: string
          name: string
          code: string
          flag_emoji: string | null
          flag_url: string | null
        }
        Insert: {
          id?: string
          name: string
          code: string
          flag_emoji?: string | null
          flag_url?: string | null
        }
        Update: {
          name?: string
          code?: string
          flag_emoji?: string | null
          flag_url?: string | null
        }
        Relationships: []
      }
      group_teams: {
        Row: {
          id: string
          group_id: string
          team_id: string
          seed_position: number | null
        }
        Insert: {
          id?: string
          group_id: string
          team_id: string
          seed_position?: number | null
        }
        Update: {
          group_id?: string
          team_id?: string
          seed_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'group_teams_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_teams_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }
      group_matches: {
        Row: {
          id: string
          group_id: string
          home_team_id: string | null
          away_team_id: string | null
          match_number: number | null
          scheduled_at: string | null
          venue: string | null
          home_score: number | null
          away_score: number | null
          sort_order: number
        }
        Insert: {
          id?: string
          group_id: string
          home_team_id?: string | null
          away_team_id?: string | null
          match_number?: number | null
          scheduled_at?: string | null
          venue?: string | null
          home_score?: number | null
          away_score?: number | null
          sort_order?: number
        }
        Update: {
          group_id?: string
          home_team_id?: string | null
          away_team_id?: string | null
          match_number?: number | null
          scheduled_at?: string | null
          venue?: string | null
          home_score?: number | null
          away_score?: number | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'group_matches_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_matches_home_team_id_fkey'
            columns: ['home_team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_matches_away_team_id_fkey'
            columns: ['away_team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }
      knockout_matches: {
        Row: {
          id: string
          tournament_id: string
          round: KnockoutRound
          match_number: number
          bracket_side: BracketSide | null
          home_source: string | null
          away_source: string | null
          home_team_id: string | null
          away_team_id: string | null
          winner_team_id: string | null
          points_value: number
          sort_order: number
          scheduled_at: string | null
          venue: string | null
        }
        Insert: {
          id?: string
          tournament_id: string
          round: KnockoutRound
          match_number: number
          bracket_side?: BracketSide | null
          home_source?: string | null
          away_source?: string | null
          home_team_id?: string | null
          away_team_id?: string | null
          winner_team_id?: string | null
          points_value: number
          sort_order: number
          scheduled_at?: string | null
          venue?: string | null
        }
        Update: {
          tournament_id?: string
          round?: KnockoutRound
          match_number?: number
          bracket_side?: BracketSide | null
          home_source?: string | null
          away_source?: string | null
          home_team_id?: string | null
          away_team_id?: string | null
          winner_team_id?: string | null
          points_value?: number
          sort_order?: number
          scheduled_at?: string | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'knockout_matches_tournament_id_fkey'
            columns: ['tournament_id']
            isOneToOne: false
            referencedRelation: 'tournaments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'knockout_matches_home_team_id_fkey'
            columns: ['home_team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'knockout_matches_away_team_id_fkey'
            columns: ['away_team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'knockout_matches_winner_team_id_fkey'
            columns: ['winner_team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }
      players: {
        Row: {
          id: string
          auth_user_id: string | null
          display_name: string
          nickname: string | null
          email: string
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          auth_user_id?: string | null
          display_name: string
          nickname?: string | null
          email: string
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          auth_user_id?: string | null
          display_name?: string
          nickname?: string | null
          email?: string
          avatar_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      tournament_entries: {
        Row: {
          id: string
          tournament_id: string
          player_id: string
          payment_status: PaymentStatus
          tiebreaker_goals: number | null
          group_stage_points: number
          knockout_points: number
          total_points: number
          tiebreaker_diff: number | null
          group_stage_rank: number | null
          overall_rank: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          player_id: string
          payment_status?: PaymentStatus
          tiebreaker_goals?: number | null
          group_stage_points?: number
          knockout_points?: number
          tiebreaker_diff?: number | null
          group_stage_rank?: number | null
          overall_rank?: number | null
          created_at?: string
        }
        Update: {
          tournament_id?: string
          player_id?: string
          payment_status?: PaymentStatus
          tiebreaker_goals?: number | null
          group_stage_points?: number
          knockout_points?: number
          tiebreaker_diff?: number | null
          group_stage_rank?: number | null
          overall_rank?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tournament_entries_tournament_id_fkey'
            columns: ['tournament_id']
            isOneToOne: false
            referencedRelation: 'tournaments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tournament_entries_player_id_fkey'
            columns: ['player_id']
            isOneToOne: false
            referencedRelation: 'players'
            referencedColumns: ['id']
          },
        ]
      }
      group_predictions: {
        Row: {
          id: string
          entry_id: string
          group_id: string
          predicted_1st: string | null
          predicted_2nd: string | null
          predicted_3rd: string | null
          points_earned: number
          submitted_at: string
        }
        Insert: {
          id?: string
          entry_id: string
          group_id: string
          predicted_1st?: string | null
          predicted_2nd?: string | null
          predicted_3rd?: string | null
          points_earned?: number
          submitted_at?: string
        }
        Update: {
          entry_id?: string
          group_id?: string
          predicted_1st?: string | null
          predicted_2nd?: string | null
          predicted_3rd?: string | null
          points_earned?: number
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'group_predictions_entry_id_fkey'
            columns: ['entry_id']
            isOneToOne: false
            referencedRelation: 'tournament_entries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_predictions_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_predictions_predicted_1st_fkey'
            columns: ['predicted_1st']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_predictions_predicted_2nd_fkey'
            columns: ['predicted_2nd']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_predictions_predicted_3rd_fkey'
            columns: ['predicted_3rd']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }
      group_results: {
        Row: {
          id: string
          group_id: string
          team_id: string
          final_position: number
          qualified: boolean
        }
        Insert: {
          id?: string
          group_id: string
          team_id: string
          final_position: number
          qualified?: boolean
        }
        Update: {
          group_id?: string
          team_id?: string
          final_position?: number
          qualified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'group_results_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'groups'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'group_results_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }
      knockout_predictions: {
        Row: {
          id: string
          entry_id: string
          match_id: string
          predicted_winner_id: string | null
          is_correct: boolean | null
          points_earned: number
          submitted_at: string
        }
        Insert: {
          id?: string
          entry_id: string
          match_id: string
          predicted_winner_id?: string | null
          is_correct?: boolean | null
          points_earned?: number
          submitted_at?: string
        }
        Update: {
          entry_id?: string
          match_id?: string
          predicted_winner_id?: string | null
          is_correct?: boolean | null
          points_earned?: number
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'knockout_predictions_entry_id_fkey'
            columns: ['entry_id']
            isOneToOne: false
            referencedRelation: 'tournament_entries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'knockout_predictions_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'knockout_matches'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'knockout_predictions_predicted_winner_id_fkey'
            columns: ['predicted_winner_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }
      tournament_stats: {
        Row: {
          id: string
          tournament_id: string
          total_group_stage_goals: number | null
        }
        Insert: {
          id?: string
          tournament_id: string
          total_group_stage_goals?: number | null
        }
        Update: {
          tournament_id?: string
          total_group_stage_goals?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'tournament_stats_tournament_id_fkey'
            columns: ['tournament_id']
            isOneToOne: true
            referencedRelation: 'tournaments'
            referencedColumns: ['id']
          },
        ]
      }
      honours: {
        Row: {
          id: string
          tournament_id: string
          player_id: string | null
          player_name: string | null
          prize_type: PrizeType
          prize_amount_gbp: number | null
          description: string | null
          points: number | null
          sort_order: number
        }
        Insert: {
          id?: string
          tournament_id: string
          player_id?: string | null
          player_name?: string | null
          prize_type: PrizeType
          prize_amount_gbp?: number | null
          description?: string | null
          points?: number | null
          sort_order?: number
        }
        Update: {
          tournament_id?: string
          player_id?: string | null
          player_name?: string | null
          prize_type?: PrizeType
          prize_amount_gbp?: number | null
          description?: string | null
          points?: number | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'honours_tournament_id_fkey'
            columns: ['tournament_id']
            isOneToOne: false
            referencedRelation: 'tournaments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'honours_player_id_fkey'
            columns: ['player_id']
            isOneToOne: false
            referencedRelation: 'players'
            referencedColumns: ['id']
          },
        ]
      }
      posts: {
        Row: {
          id: string
          tournament_id: string
          title: string
          slug: string
          content: string
          author: string
          image_url: string | null
          published_at: string
          is_published: boolean
          created_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          title: string
          slug: string
          content: string
          author?: string
          image_url?: string | null
          published_at?: string
          is_published?: boolean
          created_at?: string
        }
        Update: {
          tournament_id?: string
          title?: string
          slug?: string
          content?: string
          author?: string
          image_url?: string | null
          published_at?: string
          is_published?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'posts_tournament_id_fkey'
            columns: ['tournament_id']
            isOneToOne: false
            referencedRelation: 'tournaments'
            referencedColumns: ['id']
          },
        ]
      }
      knockout_round_config: {
        Row: {
          id: string
          tournament_id: string
          round: string
          points_value: number
          match_count: number
          sort_order: number
        }
        Insert: {
          id?: string
          tournament_id: string
          round: string
          points_value: number
          match_count: number
          sort_order: number
        }
        Update: {
          tournament_id?: string
          round?: string
          points_value?: number
          match_count?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'knockout_round_config_tournament_id_fkey'
            columns: ['tournament_id']
            isOneToOne: false
            referencedRelation: 'tournaments'
            referencedColumns: ['id']
          },
        ]
      }
      chat_messages: {
        Row: {
          id: string
          tournament_id: string
          player_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          player_id: string
          content: string
          created_at?: string
        }
        Update: {
          tournament_id?: string
          player_id?: string
          content?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'chat_messages_tournament_id_fkey'
            columns: ['tournament_id']
            isOneToOne: false
            referencedRelation: 'tournaments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chat_messages_player_id_fkey'
            columns: ['player_id']
            isOneToOne: false
            referencedRelation: 'players'
            referencedColumns: ['id']
          },
        ]
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Views: {}
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Functions: {}
  }
}
