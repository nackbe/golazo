export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          alias: string | null
          avatar_url: string | null
          email: string | null
          created_at: string
          updated_at: string
          is_system_admin: boolean | null
        }
        Insert: {
          id: string
          alias?: string | null
          avatar_url?: string | null
          email?: string | null
          created_at?: string
          updated_at?: string
          is_system_admin?: boolean | null
        }
        Update: {
          id?: string
          alias?: string | null
          avatar_url?: string | null
          email?: string | null
          created_at?: string
          updated_at?: string
          is_system_admin?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      tournaments: {
        Row: {
          id: string
          name: string
          season: string
          api_football_id: number | null
          logo_url: string | null
          country: string | null
          type: 'League' | 'Cup' | null
          start_date: string
          end_date: string
          status: 'upcoming' | 'ongoing' | 'finished' | null
          created_at: string
          updated_at: string | null
          last_fixture_sync_at: string | null
        }
        Insert: {
          id?: string
          name: string
          season: string
          api_football_id?: number | null
          logo_url?: string | null
          country?: string | null
          type?: 'League' | 'Cup' | null
          start_date: string
          end_date: string
          status?: 'upcoming' | 'ongoing' | 'finished' | null
          created_at?: string
          last_fixture_sync_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          season?: string
          api_football_id?: number | null
          logo_url?: string | null
          country?: string | null
          type?: 'League' | 'Cup' | null
          start_date?: string
          end_date?: string
          status?: 'upcoming' | 'ongoing' | 'finished' | null
          created_at?: string
          updated_at?: string | null
          last_fixture_sync_at?: string | null
        }
        Relationships: []
      }
      teams: {
        Row: {
          id: string
          api_football_id: number | null
          name: string
          code: string | null
          logo_url: string | null
          country: string | null
          created_at: string
        }
        Insert: {
          id?: string
          api_football_id?: number | null
          name: string
          code?: string | null
          logo_url?: string | null
          country?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          api_football_id?: number | null
          name?: string
          code?: string | null
          logo_url?: string | null
          country?: string | null
          created_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          id: string
          tournament_id: string
          api_football_id: number | null
          home_team_id: string | null
          away_team_id: string | null
          home_goals: number | null
          away_goals: number | null
          home_penalty_goals: number | null
          away_penalty_goals: number | null
          status: string | null
          round: string | null
          scheduled_at: string
          venue: string | null
          points_calculated: boolean | null
          created_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          api_football_id?: number | null
          home_team_id?: string | null
          away_team_id?: string | null
          home_goals?: number | null
          away_goals?: number | null
          home_penalty_goals?: number | null
          away_penalty_goals?: number | null
          status?: string | null
          round?: string | null
          scheduled_at: string
          venue?: string | null
          points_calculated?: boolean | null
          created_at?: string
        }
        Update: {
          id?: string
          tournament_id?: string
          api_football_id?: number | null
          home_team_id?: string | null
          away_team_id?: string | null
          home_goals?: number | null
          away_goals?: number | null
          home_penalty_goals?: number | null
          away_penalty_goals?: number | null
          status?: string | null
          round?: string | null
          scheduled_at?: string
          venue?: string | null
          points_calculated?: boolean | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          }
        ]
      }
      pollas: {
        Row: {
          id: string
          name: string
          code: string
          tournament_id: string
          admin_id: string
          status: 'draft' | 'open' | 'active' | 'finished' | null
          auto_approve: boolean | null
          admin_plays: boolean | null
          auto_random_prediction: boolean | null
          bet_deadline_minutes: number | null
          point_system: Json | null
          wildcards: Json | null
          special_point_system: Json | null
          created_at: string
          started_at: string | null
        }
        Insert: {
          id?: string
          name: string
          code: string
          tournament_id: string
          admin_id: string
          status?: 'draft' | 'open' | 'active' | 'finished' | null
          auto_approve?: boolean | null
          admin_plays?: boolean | null
          auto_random_prediction?: boolean | null
          bet_deadline_minutes?: number | null
          point_system?: Json | null
          wildcards?: Json | null
          special_point_system?: Json | null
          created_at?: string
          started_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          code?: string
          tournament_id?: string
          admin_id?: string
          status?: 'draft' | 'open' | 'active' | 'finished' | null
          auto_approve?: boolean | null
          admin_plays?: boolean | null
          auto_random_prediction?: boolean | null
          bet_deadline_minutes?: number | null
          point_system?: Json | null
          wildcards?: Json | null
          special_point_system?: Json | null
          created_at?: string
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pollas_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pollas_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          }
        ]
      }
      polla_members: {
        Row: {
          id: string
          polla_id: string
          user_id: string
          alias: string
          status: 'pending' | 'approved' | 'rejected' | null
          total_points: number | null
          created_at: string
        }
        Insert: {
          id?: string
          polla_id: string
          user_id: string
          alias: string
          status?: 'pending' | 'approved' | 'rejected' | null
          total_points?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          polla_id?: string
          user_id?: string
          alias?: string
          status?: 'pending' | 'approved' | 'rejected' | null
          total_points?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "polla_members_polla_id_fkey"
            columns: ["polla_id"]
            isOneToOne: false
            referencedRelation: "pollas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polla_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      predictions: {
        Row: {
          id: string
          user_id: string
          polla_id: string
          match_id: string
          home_goals: number
          away_goals: number
          wildcard_used: 'x2' | 'x3' | null
          points: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          polla_id: string
          match_id: string
          home_goals: number
          away_goals: number
          wildcard_used?: 'x2' | 'x3' | null
          points?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          polla_id?: string
          match_id?: string
          home_goals?: number
          away_goals?: number
          wildcard_used?: 'x2' | 'x3' | null
          points?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_polla_id_fkey"
            columns: ["polla_id"]
            isOneToOne: false
            referencedRelation: "pollas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      special_predictions: {
        Row: {
          id: string
          user_id: string
          polla_id: string
          type: 'champion' | 'finalist' | 'third_place' | 'least_goals_against' | 'worst_team' | 'top_scorer_team'
          team_id: string | null
          player_name: string | null
          points: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          polla_id: string
          type: 'champion' | 'finalist' | 'third_place' | 'least_goals_against' | 'worst_team' | 'top_scorer_team'
          team_id?: string | null
          player_name?: string | null
          points?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          polla_id?: string
          type?: 'champion' | 'finalist' | 'third_place' | 'least_goals_against' | 'worst_team' | 'top_scorer_team'
          team_id?: string | null
          player_name?: string | null
          points?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_predictions_polla_id_fkey"
            columns: ["polla_id"]
            isOneToOne: false
            referencedRelation: "pollas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_predictions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      tournament_special_results: {
        Row: {
          id: string
          tournament_id: string
          type: 'champion' | 'finalist' | 'third_place' | 'least_goals_against' | 'worst_team' | 'top_scorer_team'
          team_id: string | null
          created_at: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          tournament_id: string
          type: 'champion' | 'finalist' | 'third_place' | 'least_goals_against' | 'worst_team' | 'top_scorer_team'
          team_id?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          tournament_id?: string
          type?: 'champion' | 'finalist' | 'third_place' | 'least_goals_against' | 'worst_team' | 'top_scorer_team'
          team_id?: string | null
          created_at?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_special_results_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_special_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          }
        ]
      }
      match_points: {
        Row: {
          id: string
          polla_id: string
          user_id: string
          match_id: string
          points: number
          created_at: string
        }
        Insert: {
          id?: string
          polla_id: string
          user_id: string
          match_id: string
          points?: number
          created_at?: string
        }
        Update: {
          id?: string
          polla_id?: string
          user_id?: string
          match_id?: string
          points?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_points_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_points_polla_id_fkey"
            columns: ["polla_id"]
            isOneToOne: false
            referencedRelation: "pollas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_points_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      ranking_history: {
        Row: {
          id: string
          polla_id: string
          user_id: string
          match_id: string | null
          position: number
          total_points: number
          created_at: string
        }
        Insert: {
          id?: string
          polla_id: string
          user_id: string
          match_id?: string | null
          position: number
          total_points: number
          created_at?: string
        }
        Update: {
          id?: string
          polla_id?: string
          user_id?: string
          match_id?: string | null
          position?: number
          total_points?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ranking_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranking_history_polla_id_fkey"
            columns: ["polla_id"]
            isOneToOne: false
            referencedRelation: "pollas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranking_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      api_usage_logs: {
        Row: {
          id: string
          user_id: string | null
          identifier: string
          action: string
          metadata: unknown | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          identifier?: string
          action?: string
          metadata?: unknown | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          identifier?: string
          action?: string
          metadata?: unknown | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      system_settings: {
        Row: {
          key: string
          value: unknown
          description: string | null
          category: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          key: string
          value: unknown
          description?: string | null
          category?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          key?: string
          value?: unknown
          description?: string | null
          category?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      player_streaks: {
        Row: {
          id: string
          polla_id: string
          user_id: string
          current_result_streak: number
          max_result_streak: number
          current_exact_streak: number
          max_exact_streak: number
          current_negative_streak: number
          updated_at: string
        }
        Insert: {
          id?: string
          polla_id: string
          user_id: string
          current_result_streak?: number
          max_result_streak?: number
          current_exact_streak?: number
          max_exact_streak?: number
          current_negative_streak?: number
          updated_at?: string
        }
        Update: {
          id?: string
          polla_id?: string
          user_id?: string
          current_result_streak?: number
          max_result_streak?: number
          current_exact_streak?: number
          max_exact_streak?: number
          current_negative_streak?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_streaks_polla_id_fkey"
            columns: ["polla_id"]
            isOneToOne: false
            referencedRelation: "pollas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      player_badges: {
        Row: {
          id: string
          user_id: string
          badge_id: string
          polla_id: string | null
          earned_at: string
          metadata: Json
        }
        Insert: {
          id?: string
          user_id: string
          badge_id: string
          polla_id?: string | null
          earned_at?: string
          metadata?: Json
        }
        Update: {
          id?: string
          user_id?: string
          badge_id?: string
          polla_id?: string | null
          earned_at?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "player_badges_polla_id_fkey"
            columns: ["polla_id"]
            isOneToOne: false
            referencedRelation: "pollas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_server_time: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      update_updated_at_column: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      check_rate_limit: {
        Args: {
          p_identifier: string
          p_action: string
          p_max_count: number
          p_interval_minutes: number
        }
        Returns: boolean
      }
      log_api_usage: {
        Args: {
          p_identifier: string
          p_action: string
          p_user_id?: string | null
          p_metadata?: unknown | null
        }
        Returns: void
      }
    }
  }
}
