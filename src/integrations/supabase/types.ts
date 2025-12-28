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
      accident_fee_services: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          name_ar: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          name_ar?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          name_ar?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      auth_settings: {
        Row: {
          created_at: string
          email_body_template: string | null
          email_otp_enabled: boolean
          email_subject_template: string | null
          gmail_app_password: string | null
          gmail_sender_email: string | null
          id: string
          sms_019_source: string | null
          sms_019_token: string | null
          sms_019_user: string | null
          sms_message_template: string | null
          sms_otp_enabled: boolean
          smtp_host: string | null
          smtp_password: string | null
          smtp_port: number | null
          smtp_secure: boolean | null
          smtp_user: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_body_template?: string | null
          email_otp_enabled?: boolean
          email_subject_template?: string | null
          gmail_app_password?: string | null
          gmail_sender_email?: string | null
          id?: string
          sms_019_source?: string | null
          sms_019_token?: string | null
          sms_019_user?: string | null
          sms_message_template?: string | null
          sms_otp_enabled?: boolean
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_body_template?: string | null
          email_otp_enabled?: boolean
          email_subject_template?: string | null
          gmail_app_password?: string | null
          gmail_sender_email?: string | null
          id?: string
          sms_019_source?: string | null
          sms_019_token?: string | null
          sms_019_user?: string | null
          sms_message_template?: string | null
          sms_otp_enabled?: boolean
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          name_ar: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          name_ar?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          name_ar?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      broker_settlement_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          policy_id: string
          settlement_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          policy_id: string
          settlement_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          policy_id?: string
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_settlement_items_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "broker_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_settlements: {
        Row: {
          branch_id: string | null
          broker_id: string
          created_at: string
          created_by_admin_id: string | null
          direction: string
          id: string
          notes: string | null
          settlement_date: string
          settlement_number: string | null
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          broker_id: string
          created_at?: string
          created_by_admin_id?: string | null
          direction: string
          id?: string
          notes?: string | null
          settlement_date?: string
          settlement_number?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          broker_id?: string
          created_at?: string
          created_by_admin_id?: string | null
          direction?: string
          id?: string
          notes?: string | null
          settlement_date?: string
          settlement_number?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_settlements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_settlements_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_settlements_created_by_admin_id_fkey"
            columns: ["created_by_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brokers: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          legacy_wp_id: number | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          legacy_wp_id?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          legacy_wp_id?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      car_accidents: {
        Row: {
          accident_date: string | null
          accident_name: string
          branch_id: string | null
          car_id: string
          created_at: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          accident_date?: string | null
          accident_name: string
          branch_id?: string | null
          car_id: string
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          accident_date?: string | null
          accident_name?: string
          branch_id?: string | null
          car_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_accidents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_accidents_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "cars"
            referencedColumns: ["id"]
          },
        ]
      }
      cars: {
        Row: {
          branch_id: string | null
          car_number: string
          car_type: Database["public"]["Enums"]["car_type"] | null
          car_value: number | null
          client_id: string
          color: string | null
          created_at: string
          created_by_admin_id: string | null
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
          branch_id?: string | null
          car_number: string
          car_type?: Database["public"]["Enums"]["car_type"] | null
          car_value?: number | null
          client_id: string
          color?: string | null
          created_at?: string
          created_by_admin_id?: string | null
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
          branch_id?: string | null
          car_number?: string
          car_type?: Database["public"]["Enums"]["car_type"] | null
          car_value?: number | null
          client_id?: string
          color?: string | null
          created_at?: string
          created_by_admin_id?: string | null
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
            foreignKeyName: "cars_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cars_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cars_created_by_admin_id_fkey"
            columns: ["created_by_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          birth_date: string | null
          branch_id: string | null
          broker_id: string | null
          created_at: string
          created_by_admin_id: string | null
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
          phone_number_2: string | null
          signature_url: string | null
          under24_driver_id: string | null
          under24_driver_name: string | null
          under24_type: Database["public"]["Enums"]["under24_type"] | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          branch_id?: string | null
          broker_id?: string | null
          created_at?: string
          created_by_admin_id?: string | null
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
          phone_number_2?: string | null
          signature_url?: string | null
          under24_driver_id?: string | null
          under24_driver_name?: string | null
          under24_type?: Database["public"]["Enums"]["under24_type"] | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          branch_id?: string | null
          broker_id?: string | null
          created_at?: string
          created_by_admin_id?: string | null
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
          phone_number_2?: string | null
          signature_url?: string | null
          under24_driver_id?: string | null
          under24_driver_name?: string | null
          under24_type?: Database["public"]["Enums"]["under24_type"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_created_by_admin_id_fkey"
            columns: ["created_by_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_accident_fee_prices: {
        Row: {
          accident_fee_service_id: string
          company_cost: number
          company_id: string
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          accident_fee_service_id: string
          company_cost?: number
          company_id: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          accident_fee_service_id?: string
          company_cost?: number
          company_id?: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_accident_fee_prices_accident_fee_service_id_fkey"
            columns: ["accident_fee_service_id"]
            isOneToOne: false
            referencedRelation: "accident_fee_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_accident_fee_prices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_road_service_prices: {
        Row: {
          age_band: Database["public"]["Enums"]["age_band"]
          car_type: Database["public"]["Enums"]["car_type"]
          company_cost: number
          company_id: string
          created_at: string
          effective_from: string | null
          effective_to: string | null
          id: string
          notes: string | null
          road_service_id: string
          updated_at: string
        }
        Insert: {
          age_band?: Database["public"]["Enums"]["age_band"]
          car_type?: Database["public"]["Enums"]["car_type"]
          company_cost?: number
          company_id: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          road_service_id: string
          updated_at?: string
        }
        Update: {
          age_band?: Database["public"]["Enums"]["age_band"]
          car_type?: Database["public"]["Enums"]["car_type"]
          company_cost?: number
          company_id?: string
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          road_service_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_road_service_prices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_road_service_prices_road_service_id_fkey"
            columns: ["road_service_id"]
            isOneToOne: false
            referencedRelation: "road_services"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_signatures: {
        Row: {
          branch_id: string | null
          client_id: string
          created_at: string
          id: string
          ip_address: string | null
          policy_id: string | null
          signature_image_url: string
          signed_at: string
          token: string | null
          token_expires_at: string | null
          user_agent: string | null
        }
        Insert: {
          branch_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          policy_id?: string | null
          signature_image_url: string
          signed_at?: string
          token?: string | null
          token_expires_at?: string | null
          user_agent?: string | null
        }
        Update: {
          branch_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          policy_id?: string | null
          signature_image_url?: string
          signed_at?: string
          token?: string | null
          token_expires_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_signatures_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_signatures_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_signatures_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_progress: {
        Row: {
          created_at: string
          error_log: Json | null
          estimated_finish_at: string | null
          failed_items: number
          id: string
          import_type: string
          last_processed_id: string | null
          metadata: Json | null
          processed_items: number
          started_at: string | null
          status: string
          total_items: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_log?: Json | null
          estimated_finish_at?: string | null
          failed_items?: number
          id?: string
          import_type: string
          last_processed_id?: string | null
          metadata?: Json | null
          processed_items?: number
          started_at?: string | null
          status?: string
          total_items?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_log?: Json | null
          estimated_finish_at?: string | null
          failed_items?: number
          id?: string
          import_type?: string
          last_processed_id?: string | null
          metadata?: Json | null
          processed_items?: number
          started_at?: string | null
          status?: string
          total_items?: number
          updated_at?: string
        }
        Relationships: []
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
          broker_id: string | null
          category_parent:
            | Database["public"]["Enums"]["policy_type_parent"][]
            | null
          created_at: string
          elzami_commission: number | null
          id: string
          legacy_wp_id: number | null
          name: string
          name_ar: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          broker_id?: string | null
          category_parent?:
            | Database["public"]["Enums"]["policy_type_parent"][]
            | null
          created_at?: string
          elzami_commission?: number | null
          id?: string
          legacy_wp_id?: number | null
          name: string
          name_ar?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          broker_id?: string | null
          category_parent?:
            | Database["public"]["Enums"]["policy_type_parent"][]
            | null
          created_at?: string
          elzami_commission?: number | null
          id?: string
          legacy_wp_id?: number | null
          name?: string
          name_ar?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_companies_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "brokers"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_company_groups: {
        Row: {
          created_at: string
          display_name: string
          display_name_ar: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          display_name_ar?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          display_name_ar?: string | null
          id?: string
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
          template_type: string
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
          template_type?: string
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
          template_type?: string
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
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
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
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
          identifier: string | null
          ip_address: string | null
          method: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          identifier?: string | null
          ip_address?: string | null
          method?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          identifier?: string | null
          ip_address?: string | null
          method?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      media_files: {
        Row: {
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "media_files_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          link: string | null
          message: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          expires_at: string
          id: string
          identifier: string
          max_attempts: number
          otp_hash: string
          used_at: string | null
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          expires_at: string
          id?: string
          identifier: string
          max_attempts?: number
          otp_hash: string
          used_at?: string | null
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          expires_at?: string
          id?: string
          identifier?: string
          max_attempts?: number
          otp_hash?: string
          used_at?: string | null
        }
        Relationships: []
      }
      outside_cheques: {
        Row: {
          amount: number
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "outside_cheques_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_images: {
        Row: {
          created_at: string
          id: string
          image_type: string
          image_url: string
          payment_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_type?: string
          image_url: string
          payment_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_type?: string
          image_url?: string
          payment_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_images_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "policy_payments"
            referencedColumns: ["id"]
          },
        ]
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
          branch_id: string | null
          broker_direction:
            | Database["public"]["Enums"]["broker_direction"]
            | null
          broker_id: string | null
          calc_status: string | null
          cancelled: boolean | null
          car_id: string | null
          category_id: string | null
          client_id: string
          company_cost_snapshot: number | null
          company_id: string | null
          created_at: string
          created_by_admin_id: string | null
          deleted_at: string | null
          end_date: string
          group_id: string | null
          id: string
          insurance_price: number
          invoices_sent_at: string | null
          is_under_24: boolean | null
          legacy_wp_id: number | null
          notes: string | null
          payed_for_company: number | null
          policy_number: string | null
          policy_type_child:
            | Database["public"]["Enums"]["policy_type_child"]
            | null
          policy_type_parent: Database["public"]["Enums"]["policy_type_parent"]
          profit: number | null
          road_service_id: string | null
          start_date: string
          transferred: boolean | null
          transferred_car_number: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          broker_direction?:
            | Database["public"]["Enums"]["broker_direction"]
            | null
          broker_id?: string | null
          calc_status?: string | null
          cancelled?: boolean | null
          car_id?: string | null
          category_id?: string | null
          client_id: string
          company_cost_snapshot?: number | null
          company_id?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          deleted_at?: string | null
          end_date: string
          group_id?: string | null
          id?: string
          insurance_price: number
          invoices_sent_at?: string | null
          is_under_24?: boolean | null
          legacy_wp_id?: number | null
          notes?: string | null
          payed_for_company?: number | null
          policy_number?: string | null
          policy_type_child?:
            | Database["public"]["Enums"]["policy_type_child"]
            | null
          policy_type_parent: Database["public"]["Enums"]["policy_type_parent"]
          profit?: number | null
          road_service_id?: string | null
          start_date: string
          transferred?: boolean | null
          transferred_car_number?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          broker_direction?:
            | Database["public"]["Enums"]["broker_direction"]
            | null
          broker_id?: string | null
          calc_status?: string | null
          cancelled?: boolean | null
          car_id?: string | null
          category_id?: string | null
          client_id?: string
          company_cost_snapshot?: number | null
          company_id?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          deleted_at?: string | null
          end_date?: string
          group_id?: string | null
          id?: string
          insurance_price?: number
          invoices_sent_at?: string | null
          is_under_24?: boolean | null
          legacy_wp_id?: number | null
          notes?: string | null
          payed_for_company?: number | null
          policy_number?: string | null
          policy_type_child?:
            | Database["public"]["Enums"]["policy_type_child"]
            | null
          policy_type_parent?: Database["public"]["Enums"]["policy_type_parent"]
          profit?: number | null
          road_service_id?: string | null
          start_date?: string
          transferred?: boolean | null
          transferred_car_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "policies_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "policies_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "policy_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_road_service_id_fkey"
            columns: ["road_service_id"]
            isOneToOne: false
            referencedRelation: "road_services"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_groups: {
        Row: {
          car_id: string | null
          client_id: string
          created_at: string
          id: string
          name: string | null
          updated_at: string
        }
        Insert: {
          car_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          car_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_groups_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "cars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_groups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_payments: {
        Row: {
          amount: number
          branch_id: string | null
          card_expiry: string | null
          card_last_four: string | null
          cheque_image_url: string | null
          cheque_number: string | null
          cheque_status: string | null
          created_at: string
          created_by_admin_id: string | null
          id: string
          installments_count: number | null
          notes: string | null
          payment_date: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          policy_id: string
          provider: string | null
          refused: boolean | null
          tranzila_approval_code: string | null
          tranzila_index: string | null
          tranzila_receipt_url: string | null
          tranzila_response_code: string | null
          tranzila_transaction_id: string | null
        }
        Insert: {
          amount: number
          branch_id?: string | null
          card_expiry?: string | null
          card_last_four?: string | null
          cheque_image_url?: string | null
          cheque_number?: string | null
          cheque_status?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          id?: string
          installments_count?: number | null
          notes?: string | null
          payment_date?: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          policy_id: string
          provider?: string | null
          refused?: boolean | null
          tranzila_approval_code?: string | null
          tranzila_index?: string | null
          tranzila_receipt_url?: string | null
          tranzila_response_code?: string | null
          tranzila_transaction_id?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string | null
          card_expiry?: string | null
          card_last_four?: string | null
          cheque_image_url?: string | null
          cheque_number?: string | null
          cheque_status?: string | null
          created_at?: string
          created_by_admin_id?: string | null
          id?: string
          installments_count?: number | null
          notes?: string | null
          payment_date?: string
          payment_type?: Database["public"]["Enums"]["payment_type"]
          policy_id?: string
          provider?: string | null
          refused?: boolean | null
          tranzila_approval_code?: string | null
          tranzila_index?: string | null
          tranzila_receipt_url?: string | null
          tranzila_response_code?: string | null
          tranzila_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "policy_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
      policy_reminders: {
        Row: {
          id: string
          policy_id: string
          reminder_type: string
          sent_at: string
          sms_log_id: string | null
        }
        Insert: {
          id?: string
          policy_id: string
          reminder_type: string
          sent_at?: string
          sms_log_id?: string | null
        }
        Update: {
          id?: string
          policy_id?: string
          reminder_type?: string
          sent_at?: string
          sms_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "policy_reminders_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_reminders_sms_log_id_fkey"
            columns: ["sms_log_id"]
            isOneToOne: false
            referencedRelation: "sms_logs"
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
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      road_services: {
        Row: {
          active: boolean
          allowed_car_types: Database["public"]["Enums"]["car_type"][]
          created_at: string
          description: string | null
          id: string
          name: string
          name_ar: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          allowed_car_types?: Database["public"]["Enums"]["car_type"][]
          created_at?: string
          description?: string | null
          id?: string
          name: string
          name_ar?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          allowed_car_types?: Database["public"]["Enums"]["car_type"][]
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          name_ar?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          branch_id: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          message: string
          phone_number: string
          policy_id: string | null
          sent_at: string | null
          sms_type: Database["public"]["Enums"]["sms_type"]
          status: string
        }
        Insert: {
          branch_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          message: string
          phone_number: string
          policy_id?: string | null
          sent_at?: string | null
          sms_type?: Database["public"]["Enums"]["sms_type"]
          status?: string
        }
        Update: {
          branch_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          message?: string
          phone_number?: string
          policy_id?: string | null
          sent_at?: string | null
          sms_type?: Database["public"]["Enums"]["sms_type"]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_logs_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_settings: {
        Row: {
          created_at: string
          default_ab_invoice_template_id: string | null
          default_insurance_invoice_template_id: string | null
          default_signature_template_id: string | null
          enable_auto_reminders: boolean | null
          id: string
          invoice_sms_template: string | null
          is_enabled: boolean
          payment_request_template: string | null
          provider: string
          reminder_1month_template: string | null
          reminder_1week_template: string | null
          signature_sms_template: string | null
          sms_source: string | null
          sms_token: string | null
          sms_user: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_ab_invoice_template_id?: string | null
          default_insurance_invoice_template_id?: string | null
          default_signature_template_id?: string | null
          enable_auto_reminders?: boolean | null
          id?: string
          invoice_sms_template?: string | null
          is_enabled?: boolean
          payment_request_template?: string | null
          provider?: string
          reminder_1month_template?: string | null
          reminder_1week_template?: string | null
          signature_sms_template?: string | null
          sms_source?: string | null
          sms_token?: string | null
          sms_user?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_ab_invoice_template_id?: string | null
          default_insurance_invoice_template_id?: string | null
          default_signature_template_id?: string | null
          enable_auto_reminders?: boolean | null
          id?: string
          invoice_sms_template?: string | null
          is_enabled?: boolean
          payment_request_template?: string | null
          provider?: string
          reminder_1month_template?: string | null
          reminder_1week_template?: string | null
          signature_sms_template?: string | null
          sms_source?: string | null
          sms_token?: string | null
          sms_user?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_settings_default_ab_invoice_template_id_fkey"
            columns: ["default_ab_invoice_template_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_settings_default_insurance_invoice_template_id_fkey"
            columns: ["default_insurance_invoice_template_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_settings_default_signature_template_id_fkey"
            columns: ["default_signature_template_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id"]
          },
        ]
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
      can_access_branch: {
        Args: { _branch_id: string; _user_id: string }
        Returns: boolean
      }
      generate_file_number: { Args: never; Returns: string }
      generate_invoice_number: { Args: never; Returns: string }
      get_user_branch_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      report_client_debts: {
        Args: {
          p_filter_days?: number
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: {
          client_id: string
          client_name: string
          days_until_expiry: number
          earliest_expiry: string
          phone_number: string
          policies_count: number
          total_owed: number
          total_rows: number
        }[]
      }
      report_company_settlement: {
        Args: {
          p_broker_id?: string
          p_company_id?: string
          p_end_date?: string
          p_include_cancelled?: boolean
          p_policy_type_parent?: Database["public"]["Enums"]["policy_type_parent"]
          p_start_date?: string
        }
        Returns: {
          company_id: string
          company_name: string
          company_name_ar: string
          policy_count: number
          total_company_payment: number
          total_insurance_price: number
        }[]
      }
      report_company_settlement_company_options: {
        Args: {
          p_broker_id?: string
          p_end_date?: string
          p_policy_type_parent?: Database["public"]["Enums"]["policy_type_parent"]
          p_start_date?: string
        }
        Returns: {
          company_id: string
          company_name: string
          company_name_ar: string
        }[]
      }
      user_directory_get_by_ids: {
        Args: { p_ids: string[] }
        Returns: {
          display_name: string
          email: string
          id: string
        }[]
      }
      user_directory_list_active: {
        Args: never
        Returns: {
          display_name: string
          email: string
          id: string
        }[]
      }
    }
    Enums: {
      age_band: "UNDER_24" | "UP_24" | "ANY"
      app_role: "admin" | "worker"
      broker_direction: "from_broker" | "to_broker"
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
      sms_type:
        | "invoice"
        | "signature"
        | "reminder_1month"
        | "reminder_1week"
        | "manual"
        | "payment_request"
      under24_type: "none" | "client" | "additional_driver"
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
      broker_direction: ["from_broker", "to_broker"],
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
      sms_type: [
        "invoice",
        "signature",
        "reminder_1month",
        "reminder_1week",
        "manual",
        "payment_request",
      ],
      under24_type: ["none", "client", "additional_driver"],
      user_status: ["pending", "active", "blocked"],
    },
  },
} as const
