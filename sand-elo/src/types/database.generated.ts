export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      cbva_matches: {
        Row: {
          created_at: string | null
          id: string
          match_id: string | null
          match_number: number | null
          match_type: string
          process_error: string | null
          processed: boolean | null
          stage: string | null
          team1_player1_username: string
          team1_player2_username: string
          team1_score: number
          team2_player1_username: string
          team2_player2_username: string
          team2_score: number
          tournament_id: string
          winning_team: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          match_id?: string | null
          match_number?: number | null
          match_type: string
          process_error?: string | null
          processed?: boolean | null
          stage?: string | null
          team1_player1_username: string
          team1_player2_username: string
          team1_score: number
          team2_player1_username: string
          team2_player2_username: string
          team2_score: number
          tournament_id: string
          winning_team: number
        }
        Update: {
          created_at?: string | null
          id?: string
          match_id?: string | null
          match_number?: number | null
          match_type?: string
          process_error?: string | null
          processed?: boolean | null
          stage?: string | null
          team1_player1_username?: string
          team1_player2_username?: string
          team1_score?: number
          team2_player1_username?: string
          team2_player2_username?: string
          team2_score?: number
          tournament_id?: string
          winning_team?: number
        }
        Relationships: [
          {
            foreignKeyName: "cbva_matches_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "match_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbva_matches_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbva_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "cbva_import_status"
            referencedColumns: ["tournament_id"]
          },
          {
            foreignKeyName: "cbva_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "cbva_tournaments"
            referencedColumns: ["tournament_id"]
          },
        ]
      }
      cbva_players: {
        Row: {
          cbva_username: string
          created_at: string | null
          full_name: string | null
          gender: string
          id: string
          profile_id: string | null
          team_id: string | null
          tournament_id: string
        }
        Insert: {
          cbva_username: string
          created_at?: string | null
          full_name?: string | null
          gender: string
          id?: string
          profile_id?: string | null
          team_id?: string | null
          tournament_id: string
        }
        Update: {
          cbva_username?: string
          created_at?: string | null
          full_name?: string | null
          gender?: string
          id?: string
          profile_id?: string | null
          team_id?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cbva_players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "cbva_players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbva_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "cbva_import_status"
            referencedColumns: ["tournament_id"]
          },
          {
            foreignKeyName: "cbva_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "cbva_tournaments"
            referencedColumns: ["tournament_id"]
          },
        ]
      }
      cbva_tournaments: {
        Row: {
          created_at: string | null
          date: string
          division: string
          gender: string
          id: string
          import_error: string | null
          import_status: string | null
          imported_at: string | null
          location: string | null
          name: string
          processed_at: string | null
          tournament_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          division: string
          gender: string
          id?: string
          import_error?: string | null
          import_status?: string | null
          imported_at?: string | null
          location?: string | null
          name: string
          processed_at?: string | null
          tournament_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          division?: string
          gender?: string
          id?: string
          import_error?: string | null
          import_status?: string | null
          imported_at?: string | null
          location?: string | null
          name?: string
          processed_at?: string | null
          tournament_id?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string
          location: string | null
          match_source: string | null
          match_type: string
          notes: string | null
          played_at: string
          team1_player1_id: string
          team1_player2_id: string
          team1_score: number
          team2_player1_id: string
          team2_player2_id: string
          team2_score: number
          winning_team: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          location?: string | null
          match_source?: string | null
          match_type: string
          notes?: string | null
          played_at?: string
          team1_player1_id: string
          team1_player2_id: string
          team1_score: number
          team2_player1_id: string
          team2_player2_id: string
          team2_score: number
          winning_team: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          location?: string | null
          match_source?: string | null
          match_type?: string
          notes?: string | null
          played_at?: string
          team1_player1_id?: string
          team1_player2_id?: string
          team1_score?: number
          team2_player1_id?: string
          team2_player2_id?: string
          team2_score?: number
          winning_team?: number
        }
        Relationships: [
          {
            foreignKeyName: "matches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team1_player1_id_fkey"
            columns: ["team1_player1_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team1_player1_id_fkey"
            columns: ["team1_player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team1_player2_id_fkey"
            columns: ["team1_player2_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team1_player2_id_fkey"
            columns: ["team1_player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team2_player1_id_fkey"
            columns: ["team2_player1_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team2_player1_id_fkey"
            columns: ["team2_player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team2_player2_id_fkey"
            columns: ["team2_player2_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team2_player2_id_fkey"
            columns: ["team2_player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_rating_history: {
        Row: {
          confidence_level: number
          created_at: string | null
          id: string
          is_current: boolean
          match_type: string
          matches_played: number
          player_id: string
          rating: number
          rating_deviation: number
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          confidence_level: number
          created_at?: string | null
          id?: string
          is_current?: boolean
          match_type: string
          matches_played?: number
          player_id: string
          rating: number
          rating_deviation: number
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          confidence_level?: number
          created_at?: string | null
          id?: string
          is_current?: boolean
          match_type?: string
          matches_played?: number
          player_id?: string
          rating?: number
          rating_deviation?: number
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_rating_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_rating_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string | null
          cbva_username: string | null
          created_at: string | null
          first_name: string
          gender: string
          id: string
          is_active: boolean | null
          last_name: string
          last_played_at: string | null
          last_rating_calculation: string | null
          linked_to_profile_id: string | null
          mens_confidence_level: number | null
          mens_matches_played: number | null
          mens_rating: number | null
          mens_rating_deviation: number | null
          original_cbva_data: Json | null
          timezone: string | null
          updated_at: string | null
          username: string
          womens_confidence_level: number | null
          womens_matches_played: number | null
          womens_rating: number | null
          womens_rating_deviation: number | null
        }
        Insert: {
          account_type?: string | null
          cbva_username?: string | null
          created_at?: string | null
          first_name: string
          gender: string
          id: string
          is_active?: boolean | null
          last_name: string
          last_played_at?: string | null
          last_rating_calculation?: string | null
          linked_to_profile_id?: string | null
          mens_confidence_level?: number | null
          mens_matches_played?: number | null
          mens_rating?: number | null
          mens_rating_deviation?: number | null
          original_cbva_data?: Json | null
          timezone?: string | null
          updated_at?: string | null
          username: string
          womens_confidence_level?: number | null
          womens_matches_played?: number | null
          womens_rating?: number | null
          womens_rating_deviation?: number | null
        }
        Update: {
          account_type?: string | null
          cbva_username?: string | null
          created_at?: string | null
          first_name?: string
          gender?: string
          id?: string
          is_active?: boolean | null
          last_name?: string
          last_played_at?: string | null
          last_rating_calculation?: string | null
          linked_to_profile_id?: string | null
          mens_confidence_level?: number | null
          mens_matches_played?: number | null
          mens_rating?: number | null
          mens_rating_deviation?: number | null
          original_cbva_data?: Json | null
          timezone?: string | null
          updated_at?: string | null
          username?: string
          womens_confidence_level?: number | null
          womens_matches_played?: number | null
          womens_rating?: number | null
          womens_rating_deviation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_linked_to_profile_id_fkey"
            columns: ["linked_to_profile_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "profiles_linked_to_profile_id_fkey"
            columns: ["linked_to_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_rating_history: {
        Row: {
          confidence_level: number
          created_at: string | null
          id: string
          is_current: boolean
          match_type: string
          matches_played: number
          rating: number
          rating_deviation: number
          synergy_bonus: number | null
          team_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          confidence_level: number
          created_at?: string | null
          id?: string
          is_current?: boolean
          match_type: string
          matches_played?: number
          rating: number
          rating_deviation: number
          synergy_bonus?: number | null
          team_id: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          confidence_level?: number
          created_at?: string | null
          id?: string
          is_current?: boolean
          match_type?: string
          matches_played?: number
          rating?: number
          rating_deviation?: number
          synergy_bonus?: number | null
          team_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_rating_history_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      team_ratings: {
        Row: {
          created_at: string | null
          id: string
          last_played_at: string | null
          mens_games: number | null
          mens_rating: number | null
          mens_rating_deviation: number | null
          player1_id: string
          player2_id: string
          team_key: string
          updated_at: string | null
          womens_games: number | null
          womens_rating: number | null
          womens_rating_deviation: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_played_at?: string | null
          mens_games?: number | null
          mens_rating?: number | null
          mens_rating_deviation?: number | null
          player1_id: string
          player2_id: string
          team_key: string
          updated_at?: string | null
          womens_games?: number | null
          womens_rating?: number | null
          womens_rating_deviation?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_played_at?: string | null
          mens_games?: number | null
          mens_rating?: number | null
          mens_rating_deviation?: number | null
          player1_id?: string
          player2_id?: string
          team_key?: string
          updated_at?: string | null
          womens_games?: number | null
          womens_rating?: number | null
          womens_rating_deviation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_ratings_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "team_ratings_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_ratings_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "team_ratings_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      cbva_import_status: {
        Row: {
          division: string | null
          gender: string | null
          import_status: string | null
          imported_at: string | null
          pending_matches: number | null
          processed_at: string | null
          processed_matches: number | null
          total_matches: number | null
          total_players: number | null
          tournament_date: string | null
          tournament_id: string | null
          tournament_name: string | null
        }
        Relationships: []
      }
      match_details: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string | null
          location: string | null
          match_source: string | null
          match_type: string | null
          played_at: string | null
          team1_player1_first_name: string | null
          team1_player1_id: string | null
          team1_player1_last_name: string | null
          team1_player1_username: string | null
          team1_player2_first_name: string | null
          team1_player2_id: string | null
          team1_player2_last_name: string | null
          team1_player2_username: string | null
          team1_score: number | null
          team2_player1_first_name: string | null
          team2_player1_id: string | null
          team2_player1_last_name: string | null
          team2_player1_username: string | null
          team2_player2_first_name: string | null
          team2_player2_id: string | null
          team2_player2_last_name: string | null
          team2_player2_username: string | null
          team2_score: number | null
          winning_team: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team1_player1_id_fkey"
            columns: ["team1_player1_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team1_player1_id_fkey"
            columns: ["team1_player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team1_player2_id_fkey"
            columns: ["team1_player2_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team1_player2_id_fkey"
            columns: ["team1_player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team2_player1_id_fkey"
            columns: ["team2_player1_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team2_player1_id_fkey"
            columns: ["team2_player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team2_player2_id_fkey"
            columns: ["team2_player2_id"]
            isOneToOne: false
            referencedRelation: "player_match_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team2_player2_id_fkey"
            columns: ["team2_player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_match_stats: {
        Row: {
          account_type: string | null
          cbva_username: string | null
          created_at: string | null
          current_rating: number | null
          current_rating_deviation: number | null
          first_name: string | null
          gender: string | null
          is_active: boolean | null
          last_name: string | null
          losses: number | null
          match_type: string | null
          mens_rating: number | null
          mens_rating_deviation: number | null
          player_id: string | null
          total_games: number | null
          username: string | null
          win_percentage: number | null
          wins: number | null
          womens_rating: number | null
          womens_rating_deviation: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_glicko_update: {
        Args: {
          player_rating: number
          player_rd: number
          opponent_ratings: number[]
          opponent_rds: number[]
          scores: number[]
        }
        Returns: {
          new_rating: number
          new_rd: number
        }[]
      }
      check_username: {
        Args: { username_to_check: string }
        Returns: boolean
      }
      decay_inactive_player_ratings: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      get_player_stats: {
        Args: { p_match_type?: string; p_days_ago?: number }
        Returns: {
          player_id: string
          wins: number
          losses: number
          total_games: number
          win_percentage: number
        }[]
      }
      get_rating_recalc_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          total_matches: number
          total_players: number
          players_with_ratings: number
          teams_with_ratings: number
          earliest_match: string
          latest_match: string
        }[]
      }
      glicko_expected_score: {
        Args: { rating: number; opponent_rating: number; opponent_rd: number }
        Returns: number
      }
      glicko_g: {
        Args: { rd: number }
        Returns: number
      }
      link_cbva_account: {
        Args: { real_user_id: string; cbva_account_id: string }
        Returns: Json
      }
      link_temp_account: {
        Args: { real_user_id: string; temp_account_id: string }
        Returns: Json
      }
      process_2v2_glicko_match: {
        Args: {
          match_id: string
          t1p1_id: string
          t1p1_rating: number
          t1p1_rd: number
          t1p2_id: string
          t1p2_rating: number
          t1p2_rd: number
          t2p1_id: string
          t2p1_rating: number
          t2p1_rd: number
          t2p2_id: string
          t2p2_rating: number
          t2p2_rd: number
          team1_score: number
          team2_score: number
          match_type: string
        }
        Returns: undefined
      }
      process_cbva_tournament: {
        Args: { tournament_id_param: string }
        Returns: {
          players_created: number
          players_linked: number
          matches_processed: number
          errors: string[]
        }[]
      }
      process_team_glicko_ratings: {
        Args: {
          p_match_id: string
          p_team1_key: string
          p_team2_key: string
          p_team1_score: number
          p_team2_score: number
          p_match_type: string
        }
        Returns: undefined
      }
      recalculate_ratings_batch: {
        Args: { start_date?: string; end_date?: string; batch_size?: number }
        Returns: {
          processed_count: number
          batch_start_date: string
          batch_end_date: string
        }[]
      }
      recalculate_ratings_by_date_range: {
        Args: { start_date: string; end_date: string }
        Returns: number
      }
      reset_all_ratings: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      reset_cbva_tournament: {
        Args: { tournament_id_param: string }
        Returns: undefined
      }
      search_linkable_cbva_accounts: {
        Args: { search_term?: string }
        Returns: {
          id: string
          username: string
          first_name: string
          last_name: string
          cbva_username: string
          mens_matches_played: number
          womens_matches_played: number
          account_type: string
        }[]
      }
      search_temp_accounts: {
        Args: { search_term?: string }
        Returns: {
          id: string
          username: string
          first_name: string
          last_name: string
          mens_matches_played: number
          womens_matches_played: number
          account_type: string
          created_at: string
        }[]
      }
      soft_delete_match: {
        Args: { match_id_input: string }
        Returns: Json
      }
      update_match_score: {
        Args: {
          match_id_input: string
          new_team1_score: number
          new_team2_score: number
          new_winning_team: number
        }
        Returns: Json
      }
      update_rating_history_snapshots: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

