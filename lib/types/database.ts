// Supabase generate_typescript_types 결과 (프로젝트 kammofjdizvtvmbadmma). 직접 고치지 말고 다시 생성한다.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      cabinet_slots: {
        Row: {
          cabinet_id: string
          id: string
          school_id: string
          shelf: number
          side: string
          storage_class: string
        }
        Insert: {
          cabinet_id: string
          id?: string
          school_id: string
          shelf: number
          side: string
          storage_class: string
        }
        Update: {
          cabinet_id?: string
          id?: string
          school_id?: string
          shelf?: number
          side?: string
          storage_class?: string
        }
        Relationships: [
          {
            foreignKeyName: "cabinet_slots_cabinet_id_school_id_fkey"
            columns: ["cabinet_id", "school_id"]
            isOneToOne: false
            referencedRelation: "cabinets"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "cabinet_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      cabinets: {
        Row: {
          created_at: string
          door_type: string
          id: string
          label: string
          school_id: string
          shelves: number
        }
        Insert: {
          created_at?: string
          door_type: string
          id?: string
          label: string
          school_id: string
          shelves: number
        }
        Update: {
          created_at?: string
          door_type?: string
          id?: string
          label?: string
          school_id?: string
          shelves?: number
        }
        Relationships: [
          {
            foreignKeyName: "cabinets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          role: string
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          role?: string
          school_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          role?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      reagents: {
        Row: {
          cas_no: string | null
          created_at: string
          id: string
          intake_date: string
          min_stock: number
          msds_url: string | null
          name: string
          school_id: string
          slot_id: string | null
          stock: number
          unit: string
        }
        Insert: {
          cas_no?: string | null
          created_at?: string
          id?: string
          intake_date?: string
          min_stock?: number
          msds_url?: string | null
          name: string
          school_id: string
          slot_id?: string | null
          stock?: number
          unit?: string
        }
        Update: {
          cas_no?: string | null
          created_at?: string
          id?: string
          intake_date?: string
          min_stock?: number
          msds_url?: string | null
          name?: string
          school_id?: string
          slot_id?: string | null
          stock?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "reagents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reagents_slot_id_school_id_fkey"
            columns: ["slot_id", "school_id"]
            isOneToOne: false
            referencedRelation: "cabinet_slots"
            referencedColumns: ["id", "school_id"]
          },
        ]
      }
      schools: {
        Row: {
          created_at: string
          id: string
          name: string
          neis_code: string
          office_code: string
          region: string
          sido: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          neis_code: string
          office_code: string
          region: string
          sido: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          neis_code?: string
          office_code?: string
          region?: string
          sido?: string
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          amount: number
          id: string
          reagent_id: string
          school_id: string
          used_at: string
          user_id: string
        }
        Insert: {
          amount: number
          id?: string
          reagent_id: string
          school_id: string
          used_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          id?: string
          reagent_id?: string
          school_id?: string
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_reagent_id_school_id_fkey"
            columns: ["reagent_id", "school_id"]
            isOneToOne: false
            referencedRelation: "reagents"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "usage_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      reagent_usage: {
        Args: { p_limit?: number; p_reagent_id: string }
        Returns: {
          amount: number
          id: string
          used_at: string
          user_name: string | null
        }[]
      }
      recent_usage: {
        Args: { p_limit?: number }
        Returns: {
          amount: number
          id: string
          reagent_id: string
          reagent_name: string
          unit: string
          used_at: string
          user_name: string | null
        }[]
      }
      record_usage: {
        Args: { amount: number; reagent_id: string }
        Returns: {
          amount: number
          id: string
          reagent_id: string
          school_id: string
          used_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "usage_logs"
          isOneToOne: true
          isSetofReturn: false
        }
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
