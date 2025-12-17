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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      brokers: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cars: {
        Row: {
          car_number: string
          car_type: Database["public"]["Enums"]["car_type"] | null
          car_value: number | null
          client_id: string
          color: string | null
          created_at: string
          id: string
          last_license: string | null
          license_expiry: string | null
          license_type: string | null
          manufacturer_name: string | null
          model: string | null
          model_number: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          car_number: string
          car_type?: Database["public"]["Enums"]["car_type"] | null
          car_value?: number | null
          client_id: string
          color?: string | null
          created_at?: string
          id?: string
          last_license?: string | null
          license_expiry?: string | null
          license_type?: string | null
          manufacturer_name?: string | null
          model?: string | null
          model_number?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          car_number?: string
          car_type?: Database["public"]["Enums"]["car_type"] | null
          car_value?: number | null
          client_id?: string
          color?: string | null
          created_at?: string
          id?: string
          last_license?: string | null
          license_expiry?: string | null
          license_type?: string | null
          manufacturer_name?: string | null
          model?: string | null
          model_number?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cars_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          date_joined: string | null
          file_number: string | null
          full_name: string
          id: string
          id_number: string
          image_url: string | null
          less_than_24: boolean | null
          notes: string | null
          phone_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_joined?: string | null
          file_number?: string | null
          full_name: string
          id?: string
          id_number: string
          image_url?: string | null
          less_than_24?: boolean | null
          notes?: string | null
          phone_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_joined?: string | null
          file_number?: string | null
          full_name?: string
          id?: string
          id_number?: string
          image_url?: string | null
          less_than_24?: boolean | null
          notes?: string | null
          phone_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      insurance_companies: {
        Row: {
          active: boolean | null
          created_at: string
          id: string
          name: string
          name_ar: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          id?: string
          name: string
          name_ar?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          id?: string
          name?: string
          name_ar?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          created_at: string
          email: string
          id: string
          ip_address: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      outside_cheques: {
        Row: {
          amount: number
          cheque_date: string | null
          cheque_image_url: string | null
          cheque_number: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          refused: boolean | null
          used: boolean | null
        }
        Insert: {
          amount: number
          cheque_date?: string | null
          cheque_image_url?: string | null
          cheque_number?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          refused?: boolean | null
          used?: boolean | null
        }
        Update: {
          amount?: number
          cheque_date?: string | null
          cheque_image_url?: string | null
          cheque_number?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          refused?: boolean | null
          used?: boolean | null
        }
        Relationships: []
      }
      policies: {
        Row: {
          cancelled: boolean | null
          car_id: string
          client_id: string
          company_id: string
          created_at: string
          end_date: string
          id: string
          insurance_price: number
          is_under_24: boolean | null
          legacy_wp_id: number | null
          notes: string | null
          payed_for_company: number | null
          policy_type_child:
            | Database["public"]["Enums"]["policy_type_child"]
            | null
          policy_type_parent: Database["public"]["Enums"]["policy_type_parent"]
          profit: number | null
          start_date: string
          transferred: boolean | null
          transferred_car_number: string | null
          updated_at: string
        }
        Insert: {
          cancelled?: boolean | null
          car_id: string
          client_id: string
          company_id: string
          created_at?: string
          end_date: string
          id?: string
          insurance_price: number
          is_under_24?: boolean | null
          legacy_wp_id?: number | null
          notes?: string | null
          payed_for_company?: number | null
          policy_type_child?:
            | Database["public"]["Enums"]["policy_type_child"]
            | null
          policy_type_parent: Database["public"]["Enums"]["policy_type_parent"]
          profit?: number | null
          start_date: string
          transferred?: boolean | null
          transferred_car_number?: string | null
          updated_at?: string
        }
        Update: {
          cancelled?: boolean | null
          car_id?: string
          client_id?: string
          company_id?: string
          created_at?: string
          end_date?: string
          id?: string
          insurance_price?: number
          is_under_24?: boolean | null
          legacy_wp_id?: number | null
          notes?: string | null
          payed_for_company?: number | null
          policy_type_child?:
            | Database["public"]["Enums"]["policy_type_child"]
            | null
          policy_type_parent?: Database["public"]["Enums"]["policy_type_parent"]
          profit?: number | null
          start_date?: string
          transferred?: boolean | null
          transferred_car_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "policies_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "cars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_payments: {
        Row: {
          amount: number
          cheque_image_url: string | null
          cheque_number: string | null
          created_at: string
          id: string
          notes: string | null
          payment_date: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          policy_id: string
          refused: boolean | null
        }
        Insert: {
          amount: number
          cheque_image_url?: string | null
          cheque_number?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          policy_id: string
          refused?: boolean | null
        }
        Update: {
          amount?: number
          cheque_image_url?: string | null
          cheque_number?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_type?: Database["public"]["Enums"]["payment_type"]
          policy_id?: string
          refused?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "policy_payments_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          age_band: Database["public"]["Enums"]["age_band"] | null
          car_type: Database["public"]["Enums"]["car_type"] | null
          company_id: string
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          notes: string | null
          policy_type_parent: Database["public"]["Enums"]["policy_type_parent"]
          rule_type: Database["public"]["Enums"]["pricing_rule_type"]
          updated_at: string
          value: number
        }
        Insert: {
          age_band?: Database["public"]["Enums"]["age_band"] | null
          car_type?: Database["public"]["Enums"]["car_type"] | null
          company_id: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          policy_type_parent: Database["public"]["Enums"]["policy_type_parent"]
          rule_type: Database["public"]["Enums"]["pricing_rule_type"]
          updated_at?: string
          value: number
        }
        Update: {
          age_band?: Database["public"]["Enums"]["age_band"] | null
          car_type?: Database["public"]["Enums"]["car_type"] | null
          company_id?: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          policy_type_parent?: Database["public"]["Enums"]["policy_type_parent"]
          rule_type?: Database["public"]["Enums"]["pricing_rule_type"]
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      age_band: "UNDER_24" | "UP_24" | "ANY"
      app_role: "admin" | "worker"
      car_type: "car" | "cargo" | "small" | "taxi" | "tjeradown4" | "tjeraup4"
      payment_status: "paid" | "partial" | "unpaid"
      payment_type: "cash" | "cheque" | "visa" | "transfer"
      policy_type_child: "THIRD" | "FULL"
      policy_type_parent:
        | "ELZAMI"
        | "THIRD_FULL"
        | "ROAD_SERVICE"
        | "ACCIDENT_FEE_EXEMPTION"
      pricing_rule_type:
        | "THIRD_PRICE"
        | "FULL_PERCENT"
        | "DISCOUNT"
        | "MIN_PRICE"
        | "ROAD_SERVICE_PRICE"
      user_status: "pending" | "active" | "blocked"
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
      age_band: ["UNDER_24", "UP_24", "ANY"],
      app_role: ["admin", "worker"],
      car_type: ["car", "cargo", "small", "taxi", "tjeradown4", "tjeraup4"],
      payment_status: ["paid", "partial", "unpaid"],
      payment_type: ["cash", "cheque", "visa", "transfer"],
      policy_type_child: ["THIRD", "FULL"],
      policy_type_parent: [
        "ELZAMI",
        "THIRD_FULL",
        "ROAD_SERVICE",
        "ACCIDENT_FEE_EXEMPTION",
      ],
      pricing_rule_type: [
        "THIRD_PRICE",
        "FULL_PERCENT",
        "DISCOUNT",
        "MIN_PRICE",
        "ROAD_SERVICE_PRICE",
      ],
      user_status: ["pending", "active", "blocked"],
    },
  },
} as const
