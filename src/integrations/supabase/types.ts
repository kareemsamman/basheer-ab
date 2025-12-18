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
          image_url: string | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          notes?: string | null
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
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
          broker_id: string | null
          created_at: string
          date_joined: string | null
          deleted_at: string | null
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
          broker_id?: string | null
          created_at?: string
          date_joined?: string | null
          deleted_at?: string | null
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
          broker_id?: string | null
          created_at?: string
          date_joined?: string | null
          deleted_at?: string | null
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
        Relationships: [
          {
            foreignKeyName: "clients_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          mode: string
          name: string
          name_ar: string | null
          name_he: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          mode?: string
          name: string
          name_ar?: string | null
          name_he?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          mode?: string
          name?: string
          name_ar?: string | null
          name_he?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      insurance_companies: {
        Row: {
          active: boolean | null
          category_parent:
            | Database["public"]["Enums"]["policy_type_parent"]
            | null
          created_at: string
          id: string
          name: string
          name_ar: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          category_parent?:
            | Database["public"]["Enums"]["policy_type_parent"]
            | null
          created_at?: string
          id?: string
          name: string
          name_ar?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          category_parent?:
            | Database["public"]["Enums"]["policy_type_parent"]
            | null
          created_at?: string
          id?: string
          name?: string
          name_ar?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoice_templates: {
        Row: {
          body_html: string | null
          created_at: string
          created_by_admin_id: string | null
          direction: string
          footer_html: string | null
          header_html: string | null
          id: string
          is_active: boolean | null
          language: string
          logo_url: string | null
          name: string
          template_layout_json: Json | null
          updated_at: string
          version: number
        }
        Insert: {
          body_html?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          direction?: string
          footer_html?: string | null
          header_html?: string | null
          id?: string
          is_active?: boolean | null
          language: string
          logo_url?: string | null
          name: string
          template_layout_json?: Json | null
          updated_at?: string
          version?: number
        }
        Update: {
          body_html?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          direction?: string
          footer_html?: string | null
          header_html?: string | null
          id?: string
          is_active?: boolean | null
          language?: string
          logo_url?: string | null
          name?: string
          template_layout_json?: Json | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_templates_created_by_admin_id_fkey"
            columns: ["created_by_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by_admin_id: string | null
          error_message: string | null
          id: string
          invoice_number: string
          issued_at: string
          language: string
          metadata_json: Json | null
          pdf_url: string | null
          policy_id: string
          status: string
          template_id: string | null
          template_version_used: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_admin_id?: string | null
          error_message?: string | null
          id?: string
          invoice_number: string
          issued_at?: string
          language: string
          metadata_json?: Json | null
          pdf_url?: string | null
          policy_id: string
          status?: string
          template_id?: string | null
          template_version_used?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_admin_id?: string | null
          error_message?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          language?: string
          metadata_json?: Json | null
          pdf_url?: string | null
          policy_id?: string
          status?: string
          template_id?: string | null
          template_version_used?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_admin_id_fkey"
            columns: ["created_by_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id"]
          },
        ]
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
      media_files: {
        Row: {
          cdn_url: string
          created_at: string
          deleted_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          mime_type: string
          original_name: string
          size: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          cdn_url: string
          created_at?: string
          deleted_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type: string
          original_name: string
          size: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          cdn_url?: string
          created_at?: string
          deleted_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string
          original_name?: string
          size?: number
          storage_path?: string
          uploaded_by?: string | null
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
      payment_settings: {
        Row: {
          api_password: string | null
          created_at: string
          fail_url: string | null
          id: string
          is_enabled: boolean
          notify_url: string | null
          provider: string
          success_url: string | null
          terminal_name: string | null
          test_mode: boolean
          updated_at: string
        }
        Insert: {
          api_password?: string | null
          created_at?: string
          fail_url?: string | null
          id?: string
          is_enabled?: boolean
          notify_url?: string | null
          provider?: string
          success_url?: string | null
          terminal_name?: string | null
          test_mode?: boolean
          updated_at?: string
        }
        Update: {
          api_password?: string | null
          created_at?: string
          fail_url?: string | null
          id?: string
          is_enabled?: boolean
          notify_url?: string | null
          provider?: string
          success_url?: string | null
          terminal_name?: string | null
          test_mode?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      policies: {
        Row: {
          broker_id: string | null
          calc_status: string | null
          cancelled: boolean | null
          car_id: string | null
          category_id: string | null
          client_id: string
          company_id: string
          created_at: string
          created_by_admin_id: string | null
          deleted_at: string | null
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
          broker_id?: string | null
          calc_status?: string | null
          cancelled?: boolean | null
          car_id?: string | null
          category_id?: string | null
          client_id: string
          company_id: string
          created_at?: string
          created_by_admin_id?: string | null
          deleted_at?: string | null
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
          broker_id?: string | null
          calc_status?: string | null
          cancelled?: boolean | null
          car_id?: string | null
          category_id?: string | null
          client_id?: string
          company_id?: string
          created_at?: string
          created_by_admin_id?: string | null
          deleted_at?: string | null
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
            foreignKeyName: "policies_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "cars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "insurance_categories"
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
          {
            foreignKeyName: "policies_created_by_admin_id_fkey"
            columns: ["created_by_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_payments: {
        Row: {
          amount: number
          cheque_image_url: string | null
          cheque_number: string | null
          cheque_status: string | null
          created_at: string
          created_by_admin_id: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          policy_id: string
          provider: string | null
          refused: boolean | null
          tranzila_approval_code: string | null
          tranzila_index: string | null
          tranzila_response_code: string | null
          tranzila_transaction_id: string | null
        }
        Insert: {
          amount: number
          cheque_image_url?: string | null
          cheque_number?: string | null
          cheque_status?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          policy_id: string
          provider?: string | null
          refused?: boolean | null
          tranzila_approval_code?: string | null
          tranzila_index?: string | null
          tranzila_response_code?: string | null
          tranzila_transaction_id?: string | null
        }
        Update: {
          amount?: number
          cheque_image_url?: string | null
          cheque_number?: string | null
          cheque_status?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_type?: Database["public"]["Enums"]["payment_type"]
          policy_id?: string
          provider?: string | null
          refused?: boolean | null
          tranzila_approval_code?: string | null
          tranzila_index?: string | null
          tranzila_response_code?: string | null
          tranzila_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "policy_payments_created_by_admin_id_fkey"
            columns: ["created_by_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      calculate_policy_company_payment: {
        Args: {
          p_age_band: Database["public"]["Enums"]["age_band"]
          p_car_type: Database["public"]["Enums"]["car_type"]
          p_car_value: number
          p_car_year: number
          p_company_id: string
          p_insurance_price: number
          p_policy_type_child: Database["public"]["Enums"]["policy_type_child"]
          p_policy_type_parent: Database["public"]["Enums"]["policy_type_parent"]
        }
        Returns: {
          company_payment: number
          profit: number
        }[]
      }
      generate_file_number: { Args: never; Returns: string }
      generate_invoice_number: { Args: never; Returns: string }
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
        | "HEALTH"
        | "LIFE"
        | "PROPERTY"
        | "TRAVEL"
        | "BUSINESS"
        | "OTHER"
      pricing_rule_type:
        | "THIRD_PRICE"
        | "FULL_PERCENT"
        | "DISCOUNT"
        | "MIN_PRICE"
        | "ROAD_SERVICE_PRICE"
        | "ROAD_SERVICE_BASE"
        | "ROAD_SERVICE_EXTRA_OLD_CAR"
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
        "HEALTH",
        "LIFE",
        "PROPERTY",
        "TRAVEL",
        "BUSINESS",
        "OTHER",
      ],
      pricing_rule_type: [
        "THIRD_PRICE",
        "FULL_PERCENT",
        "DISCOUNT",
        "MIN_PRICE",
        "ROAD_SERVICE_PRICE",
        "ROAD_SERVICE_BASE",
        "ROAD_SERVICE_EXTRA_OLD_CAR",
      ],
      user_status: ["pending", "active", "blocked"],
    },
  },
} as const
