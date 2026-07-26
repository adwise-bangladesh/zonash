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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abuse_events: {
        Row: {
          created_at: string
          fingerprint: string | null
          id: number
          ip: string | null
          kind: string
          meta: Json
          phone: string | null
        }
        Insert: {
          created_at?: string
          fingerprint?: string | null
          id?: number
          ip?: string | null
          kind: string
          meta?: Json
          phone?: string | null
        }
        Update: {
          created_at?: string
          fingerprint?: string | null
          id?: number
          ip?: string | null
          kind?: string
          meta?: Json
          phone?: string | null
        }
        Relationships: []
      }
      blocked_identities: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          reason: string | null
          value: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          reason?: string | null
          value: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          reason?: string | null
          value?: string
        }
        Relationships: []
      }
      coupon_usage: {
        Row: {
          coupon_code: string
          created_at: string
          discount: number
          id: number
          phone: string
          wc_order_id: number
        }
        Insert: {
          coupon_code: string
          created_at?: string
          discount?: number
          id?: number
          phone: string
          wc_order_id: number
        }
        Update: {
          coupon_code?: string
          created_at?: string
          discount?: number
          id?: number
          phone?: string
          wc_order_id?: number
        }
        Relationships: []
      }
      customer_history: {
        Row: {
          data: Json
          phone: string
          updated_at: string
        }
        Insert: {
          data?: Json
          phone: string
          updated_at?: string
        }
        Update: {
          data?: Json
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_login_otps: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          last_sent_at: string
          max_attempts: number
          phone: string
          send_count: number
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          last_sent_at?: string
          max_attempts?: number
          phone: string
          send_count?: number
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          last_sent_at?: string
          max_attempts?: number
          phone?: string
          send_count?: number
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          payload: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          read_at?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      order_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          wc_order_id: number
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          wc_order_id: number
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          wc_order_id?: number
        }
        Relationships: []
      }
      order_ops: {
        Row: {
          courier: string | null
          created_at: string
          internal_notes: string | null
          pickup_slot: string | null
          steadfast_consignment_id: number | null
          steadfast_status: string | null
          steadfast_synced_at: string | null
          steadfast_tracking_code: string | null
          tracking_number: string | null
          updated_at: string
          updated_by: string | null
          wc_order_id: number
        }
        Insert: {
          courier?: string | null
          created_at?: string
          internal_notes?: string | null
          pickup_slot?: string | null
          steadfast_consignment_id?: number | null
          steadfast_status?: string | null
          steadfast_synced_at?: string | null
          steadfast_tracking_code?: string | null
          tracking_number?: string | null
          updated_at?: string
          updated_by?: string | null
          wc_order_id: number
        }
        Update: {
          courier?: string | null
          created_at?: string
          internal_notes?: string | null
          pickup_slot?: string | null
          steadfast_consignment_id?: number | null
          steadfast_status?: string | null
          steadfast_synced_at?: string | null
          steadfast_tracking_code?: string | null
          tracking_number?: string | null
          updated_at?: string
          updated_by?: string | null
          wc_order_id?: number
        }
        Relationships: []
      }
      order_otps: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          decision: string | null
          decision_reason: string | null
          expires_at: string
          ip_address: string | null
          last_sent_at: string
          max_attempts: number
          phone: string
          phone_hash: string
          send_count: number
          tracking: Json | null
          updated_at: string
          verified_at: string | null
          wc_order_id: number
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          decision?: string | null
          decision_reason?: string | null
          expires_at: string
          ip_address?: string | null
          last_sent_at?: string
          max_attempts?: number
          phone: string
          phone_hash: string
          send_count?: number
          tracking?: Json | null
          updated_at?: string
          verified_at?: string | null
          wc_order_id: number
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          decision?: string | null
          decision_reason?: string | null
          expires_at?: string
          ip_address?: string | null
          last_sent_at?: string
          max_attempts?: number
          phone?: string
          phone_hash?: string
          send_count?: number
          tracking?: Json | null
          updated_at?: string
          verified_at?: string | null
          wc_order_id?: number
        }
        Relationships: []
      }
      orders_cache: {
        Row: {
          billing_city: string | null
          billing_country: string | null
          currency: string
          customer_email: string | null
          customer_name: string | null
          customer_note: string | null
          customer_phone: string | null
          date_completed: string | null
          date_created: string
          date_modified: string
          date_paid: string | null
          discount_total: number
          fts: unknown
          ip_address: string | null
          items: Json
          items_count: number
          order_number: string
          payment_method: string | null
          payment_method_title: string | null
          raw: Json
          shipping_address_1: string | null
          shipping_address_2: string | null
          shipping_city: string | null
          shipping_country: string | null
          shipping_name: string | null
          shipping_phone: string | null
          shipping_postcode: string | null
          shipping_state: string | null
          shipping_total: number
          skus: string[]
          source_channel: string | null
          status: string
          subtotal: number
          synced_at: string
          tax_total: number
          total: number
          transaction_id: string | null
          wc_order_id: number
        }
        Insert: {
          billing_city?: string | null
          billing_country?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_note?: string | null
          customer_phone?: string | null
          date_completed?: string | null
          date_created: string
          date_modified: string
          date_paid?: string | null
          discount_total?: number
          fts?: unknown
          ip_address?: string | null
          items?: Json
          items_count?: number
          order_number: string
          payment_method?: string | null
          payment_method_title?: string | null
          raw: Json
          shipping_address_1?: string | null
          shipping_address_2?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_name?: string | null
          shipping_phone?: string | null
          shipping_postcode?: string | null
          shipping_state?: string | null
          shipping_total?: number
          skus?: string[]
          source_channel?: string | null
          status: string
          subtotal?: number
          synced_at?: string
          tax_total?: number
          total?: number
          transaction_id?: string | null
          wc_order_id: number
        }
        Update: {
          billing_city?: string | null
          billing_country?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_note?: string | null
          customer_phone?: string | null
          date_completed?: string | null
          date_created?: string
          date_modified?: string
          date_paid?: string | null
          discount_total?: number
          fts?: unknown
          ip_address?: string | null
          items?: Json
          items_count?: number
          order_number?: string
          payment_method?: string | null
          payment_method_title?: string | null
          raw?: Json
          shipping_address_1?: string | null
          shipping_address_2?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_name?: string | null
          shipping_phone?: string | null
          shipping_postcode?: string | null
          shipping_state?: string | null
          shipping_total?: number
          skus?: string[]
          source_channel?: string | null
          status?: string
          subtotal?: number
          synced_at?: string
          tax_total?: number
          total?: number
          transaction_id?: string | null
          wc_order_id?: number
        }
        Relationships: []
      }
      police_stations: {
        Row: {
          created_at: string
          district_id: number
          district_name: string
          id: number
          is_dhaka_city: boolean
          name: string
        }
        Insert: {
          created_at?: string
          district_id: number
          district_name: string
          id?: number
          is_dhaka_city?: boolean
          name: string
        }
        Update: {
          created_at?: string
          district_id?: number
          district_name?: string
          id?: number
          is_dhaka_city?: boolean
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      server_error_log: {
        Row: {
          created_at: string
          id: string
          message: string
          meta: Json
          scope: string
          stack: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          meta?: Json
          scope: string
          stack?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          meta?: Json
          scope?: string
          stack?: string | null
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
      webhook_events: {
        Row: {
          delivery_id: string
          error: string | null
          payload: Json | null
          processed_at: string | null
          received_at: string
          source: string
          topic: string
        }
        Insert: {
          delivery_id: string
          error?: string | null
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
          source?: string
          topic: string
        }
        Update: {
          delivery_id?: string
          error?: string | null
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
          source?: string
          topic?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      customer_order_stats: {
        Args: { emails: string[] }
        Returns: {
          cancelled: number
          completed: number
          email: string
          total: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff_or_admin: { Args: { _user_id: string }; Returns: boolean }
      orders_cache_status_counts: {
        Args: never
        Returns: {
          count: number
          status: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "staff" | "viewer" | "customer"
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
      app_role: ["admin", "staff", "viewer", "customer"],
    },
  },
} as const
