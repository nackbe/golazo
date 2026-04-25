export interface UserProfile {
  id: string;
  alias: string;
  email: string;
  avatar_url?: string | null;
  created_at: string;
}

export interface Polla {
  id: string;
  name: string;
  code: string;
  tournament_id: string;
  admin_id: string;
  status: 'draft' | 'open' | 'active' | 'finished';
  auto_approve: boolean;
  bet_deadline_minutes: number;
  point_system: PointSystem;
  wildcards: WildcardConfig[];
  created_at: string;
  started_at?: string | null;
}

export interface PointSystem {
  correct_result: number;
  home_goals: number;
  away_goals: number;
  exact_score: number;
  goal_difference: number;
  total_goals: number;
  team_qualified: number;
  champion: number;
  finalist: number;
  third_place: number;
}

export interface WildcardConfig {
  type: 'x2' | 'x3';
  quantity: number;
}

export interface Tournament {
  id: string;
  name: string;
  season: string;
  api_football_id: number;
  logo_url?: string | null;
  start_date: string;
  end_date: string;
  status: 'upcoming' | 'ongoing' | 'finished';
}

export interface Match {
  id: string;
  tournament_id: string;
  api_football_id: number;
  home_team_id: string;
  away_team_id: string;
  home_goals?: number | null;
  away_goals?: number | null;
  status: 'NS' | '1H' | 'HT' | '2H' | 'ET' | 'P' | 'FT' | 'AFT' | 'CANC';
  round?: string | null;
  scheduled_at: string;
  venue?: string | null;
}

export interface Team {
  id: string;
  api_football_id: number;
  name: string;
  code?: string | null;
  logo_url?: string | null;
  country?: string | null;
}

export interface Prediction {
  id: string;
  user_id: string;
  polla_id: string;
  match_id: string;
  home_goals: number;
  away_goals: number;
  wildcard_used?: 'x2' | 'x3' | null;
  points?: number | null;
  created_at: string;
  updated_at: string;
}

export interface RankingEntry {
  user_id: string;
  alias: string;
  avatar_url?: string | null;
  total_points: number;
  exact_scores: number;
  correct_results: number;
  wildcards_used: number;
  position: number;
  previous_position?: number | null;
}

export interface SpecialPrediction {
  id: string;
  user_id: string;
  polla_id: string;
  type: 'champion' | 'finalist' | 'third_place' | 'qualified' | 'quarterfinalist' | 'semifinalist' | 'top_scorer';
  team_id?: string | null;
  player_name?: string | null;
  points?: number | null;
}
