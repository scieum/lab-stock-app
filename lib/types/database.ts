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
          storage_class: string | null
          storage_classes: string[]
        }
        Insert: {
          cabinet_id: string
          id?: string
          school_id: string
          shelf: number
          side: string
          storage_class?: string | null
          storage_classes?: string[]
        }
        Update: {
          cabinet_id?: string
          id?: string
          school_id?: string
          shelf?: number
          side?: string
          storage_class?: string | null
          storage_classes?: string[]
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
          number: number
          school_id: string
          shelves: number
        }
        Insert: {
          created_at?: string
          door_type: string
          id?: string
          label: string
          number: number
          school_id: string
          shelves: number
        }
        Update: {
          created_at?: string
          door_type?: string
          id?: string
          label?: string
          number?: number
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
      intake_logs: {
        Row: {
          amount: number
          created_at: string
          id: string
          intake_date: string
          reagent_id: string
          school_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          intake_date: string
          reagent_id: string
          school_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          intake_date?: string
          reagent_id?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_logs_reagent_id_school_id_fkey"
            columns: ["reagent_id", "school_id"]
            isOneToOne: false
            referencedRelation: "reagents"
            referencedColumns: ["id", "school_id"]
          },
          {
            foreignKeyName: "intake_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          email: string
          id: string
          invited_at: string
          invited_by: string | null
          role: string
          school_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          email: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          role: string
          school_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          email?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          role?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_school_id_fkey"
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
          low_stock_since: string | null
          min_stock: number
          min_stock_auto_basis: string | null
          min_stock_source: string
          msds_url: string | null
          name: string
          reorder_groups: number | null
          reorder_per_group: number | null
          school_id: string
          slot_id: string | null
          stock: number
          storage_class: string | null
          unit: string
        }
        Insert: {
          cas_no?: string | null
          created_at?: string
          id?: string
          intake_date?: string
          low_stock_since?: string | null
          min_stock?: number
          min_stock_auto_basis?: string | null
          min_stock_source?: string
          msds_url?: string | null
          name: string
          reorder_groups?: number | null
          reorder_per_group?: number | null
          school_id: string
          slot_id?: string | null
          stock?: number
          storage_class?: string | null
          unit?: string
        }
        Update: {
          cas_no?: string | null
          created_at?: string
          id?: string
          intake_date?: string
          low_stock_since?: string | null
          min_stock?: number
          min_stock_auto_basis?: string | null
          min_stock_source?: string
          msds_url?: string | null
          name?: string
          reorder_groups?: number | null
          reorder_per_group?: number | null
          school_id?: string
          slot_id?: string | null
          stock?: number
          storage_class?: string | null
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
          cabinet_seq: number
          created_at: string
          id: string
          is_demo: boolean
          name: string
          neis_code: string | null
          office_code: string
          region: string
          sido: string
        }
        Insert: {
          cabinet_seq?: number
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          neis_code?: string | null
          office_code: string
          region: string
          sido: string
        }
        Update: {
          cabinet_seq?: number
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          neis_code?: string | null
          office_code?: string
          region?: string
          sido?: string
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          amount: number
          demo_user_name: string | null
          id: string
          memo: string | null
          reagent_id: string
          school_id: string
          used_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          demo_user_name?: string | null
          id?: string
          memo?: string | null
          reagent_id: string
          school_id: string
          used_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          demo_user_name?: string | null
          id?: string
          memo?: string | null
          reagent_id?: string
          school_id?: string
          used_at?: string
          user_id?: string | null
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
      vendors: {
        Row: {
          contact: string | null
          created_at: string
          id: string
          name: string
          note: string | null
          school_id: string | null
          search_url: string | null
          website: string | null
        }
        Insert: {
          contact?: string | null
          created_at?: string
          id?: string
          name: string
          note?: string | null
          school_id?: string | null
          search_url?: string | null
          website?: string | null
        }
        Update: {
          contact?: string | null
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          school_id?: string | null
          search_url?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_school_id_fkey"
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
      add_cabinet: {
        Args: never
        Returns: {
          created_at: string
          door_type: string
          id: string
          label: string
          number: number
          school_id: string
          shelves: number
        }
        SetofOptions: {
          from: "*"
          to: "cabinets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_member_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: {
          created_at: string
          display_name: string
          role: string
          school_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_cabinet: { Args: { p_cabinet_id: string }; Returns: Json }
      demo_reagent_usage: {
        Args: { p_limit?: number; p_reagent_id: string }
        Returns: {
          amount: number
          id: string
          used_at: string
          user_name: string
        }[]
      }
      demo_recent_usage: {
        Args: { p_limit?: number }
        Returns: {
          amount: number
          id: string
          reagent_id: string
          reagent_name: string
          unit: string
          used_at: string
          user_name: string
        }[]
      }
      invite_members: {
        Args: { p_emails: string[]; p_role: string }
        Returns: {
          accepted_at: string | null
          accepted_user_id: string | null
          email: string
          id: string
          invited_at: string
          invited_by: string | null
          role: string
          school_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "invites"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      pending_signup_user: { Args: { p_email: string }; Returns: string }
      place_reagent: {
        Args: { p_reagent_id: string; p_slot_id?: string }
        Returns: Json
      }
      reagent_usage: {
        Args: { p_limit?: number; p_reagent_id: string }
        Returns: {
          amount: number
          id: string
          used_at: string
          user_name: string
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
          user_name: string
        }[]
      }
      record_intake: {
        Args: { p_amount: number; p_intake_date: string; p_reagent_id: string }
        Returns: {
          amount: number
          created_at: string
          id: string
          intake_date: string
          reagent_id: string
          school_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "intake_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_usage: {
        Args: { amount: number; memo?: string; reagent_id: string }
        Returns: {
          amount: number
          demo_user_name: string | null
          id: string
          memo: string | null
          reagent_id: string
          school_id: string
          used_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "usage_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_profile: {
        Args: {
          p_display_name: string
          p_neis_code: string
          p_office_code: string
          p_region: string
          p_school_name: string
          p_sido: string
          p_user_id: string
        }
        Returns: {
          created_at: string
          display_name: string
          role: string
          school_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_reagent: {
        Args: {
          p_intake_date: string
          p_msds_url?: string
          p_name: string
          p_stock: number
          p_storage_class: string
          p_unit: string
        }
        Returns: {
          cas_no: string | null
          created_at: string
          id: string
          intake_date: string
          low_stock_since: string | null
          min_stock: number
          min_stock_auto_basis: string | null
          min_stock_source: string
          msds_url: string | null
          name: string
          reorder_groups: number | null
          reorder_per_group: number | null
          school_id: string
          slot_id: string | null
          stock: number
          storage_class: string | null
          unit: string
        }
        SetofOptions: {
          from: "*"
          to: "reagents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_member: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          display_name: string
          role: string
          school_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rename_cabinet: {
        Args: { p_cabinet_id: string; p_label: string }
        Returns: {
          created_at: string
          door_type: string
          id: string
          label: string
          number: number
          school_id: string
          shelves: number
        }
        SetofOptions: {
          from: "*"
          to: "cabinets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reset_reorder_threshold: { Args: { p_reagent_id: string }; Returns: Json }
      save_cabinet_layout: {
        Args: {
          p_cabinet_id: string
          p_door_type: string
          p_shelves: number
          p_slots: Json
        }
        Returns: Json
      }
      save_reorder_basis: { Args: { p_items: Json }; Returns: Json }
      set_reorder_threshold: {
        Args: { p_min_stock: number; p_reagent_id: string }
        Returns: Json
      }
      usage_history: {
        Args: {
          p_limit?: number
          p_only_mine?: boolean
          p_query?: string
          p_since?: string
        }
        Returns: {
          amount: number
          id: string
          is_mine: boolean
          memo: string
          msds_url: string
          reagent_id: string
          reagent_name: string
          unit: string
          used_at: string
          user_name: string
        }[]
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
