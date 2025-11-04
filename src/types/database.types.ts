export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      assessment_types: {
        Row: {
          created_at: string | null
          description: string | null
          engine_ref: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          engine_ref?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          engine_ref?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      client_users: {
        Row: {
          client_id: string
          created_at: string | null
          email: string
          id: string
          name: string | null
          role: Database["public"]["Enums"]["client_user_role"]
          status: Database["public"]["Enums"]["user_status"]
          surname: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          email: string
          id?: string
          name?: string | null
          role?: Database["public"]["Enums"]["client_user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          surname?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
          role?: Database["public"]["Enums"]["client_user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          surname?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string | null
          created_by: string | null
          domain: string | null
          id: string
          name: string
          primary_contact_email: string | null
          status: Database["public"]["Enums"]["client_status"]
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          domain?: string | null
          id?: string
          name: string
          primary_contact_email?: string | null
          status?: Database["public"]["Enums"]["client_status"]
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          domain?: string | null
          id?: string
          name?: string
          primary_contact_email?: string | null
          status?: Database["public"]["Enums"]["client_status"]
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "imd_users"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_assessments: {
        Row: {
          assessment_type_id: string
          cohort_id: string
          created_at: string | null
          end_date: string | null
          id: string
          name: string | null
          start_date: string | null
          status: string | null
        }
        Insert: {
          assessment_type_id: string
          cohort_id: string
          created_at?: string | null
          end_date?: string | null
          id?: string
          name?: string | null
          start_date?: string | null
          status?: string | null
        }
        Update: {
          assessment_type_id?: string
          cohort_id?: string
          created_at?: string | null
          end_date?: string | null
          id?: string
          name?: string | null
          start_date?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cohort_assessments_assessment_type_id_fkey"
            columns: ["assessment_type_id"]
            isOneToOne: false
            referencedRelation: "assessment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_assessments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_participants: {
        Row: {
          client_user_id: string
          cohort_id: string
          id: string
          status: Database["public"]["Enums"]["participant_status"]
        }
        Insert: {
          client_user_id: string
          cohort_id: string
          id?: string
          status?: Database["public"]["Enums"]["participant_status"]
        }
        Update: {
          client_user_id?: string
          cohort_id?: string
          id?: string
          status?: Database["public"]["Enums"]["participant_status"]
        }
        Relationships: [
          {
            foreignKeyName: "cohort_participants_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "client_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_participants_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          client_id: string
          created_at: string | null
          created_by: string | null
          end_date: string | null
          id: string
          name: string
          plan_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["cohort_status"]
        }
        Insert: {
          client_id: string
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          id?: string
          name: string
          plan_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["cohort_status"]
        }
        Update: {
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          id?: string
          name?: string
          plan_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["cohort_status"]
        }
        Relationships: [
          {
            foreignKeyName: "cohorts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohorts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "imd_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohorts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      imd_users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          name: string | null
          password_hash: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          surname: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          name?: string | null
          password_hash: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          surname?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
          password_hash?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          surname?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      participant_assessments: {
        Row: {
          allow_reviewer_nominations: boolean | null
          cohort_assessment_id: string
          created_at: string | null
          id: string
          participant_id: string
          score: number | null
          status: string | null
          submitted_at: string | null
        }
        Insert: {
          allow_reviewer_nominations?: boolean | null
          cohort_assessment_id: string
          created_at?: string | null
          id?: string
          participant_id: string
          score?: number | null
          status?: string | null
          submitted_at?: string | null
        }
        Update: {
          allow_reviewer_nominations?: boolean | null
          cohort_assessment_id?: string
          created_at?: string | null
          id?: string
          participant_id?: string
          score?: number | null
          status?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participant_assessments_cohort_assessment_id_fkey"
            columns: ["cohort_assessment_id"]
            isOneToOne: false
            referencedRelation: "cohort_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_assessments_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "cohort_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_assessments: {
        Row: {
          assessment_id: string
          id: string
          plan_id: string
        }
        Insert: {
          assessment_id: string
          id?: string
          plan_id: string
        }
        Update: {
          assessment_id?: string
          id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_assessments_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_assessments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      reviewer_nominations: {
        Row: {
          created_at: string | null
          id: string
          nominated_by_id: string
          participant_assessment_id: string
          review_submitted_at: string | null
          reviewer_id: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          nominated_by_id: string
          participant_assessment_id: string
          review_submitted_at?: string | null
          reviewer_id: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nominated_by_id?: string
          participant_assessment_id?: string
          review_submitted_at?: string | null
          reviewer_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviewer_nominations_nominated_by_id_fkey"
            columns: ["nominated_by_id"]
            isOneToOne: false
            referencedRelation: "client_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviewer_nominations_participant_assessment_id_fkey"
            columns: ["participant_assessment_id"]
            isOneToOne: false
            referencedRelation: "participant_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviewer_nominations_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "client_users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      client_status: "active" | "inactive"
      client_user_role: "participant" | "manager" | "observer"
      cohort_status: "draft" | "active" | "completed"
      participant_status: "invited" | "active" | "completed"
      user_role: "admin" | "user"
      user_status: "active" | "inactive"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      client_status: ["active", "inactive"],
      client_user_role: ["participant", "manager", "observer"],
      cohort_status: ["draft", "active", "completed"],
      participant_status: ["invited", "active", "completed"],
      user_role: ["admin", "user"],
      user_status: ["active", "inactive"],
    },
  },
} as const
