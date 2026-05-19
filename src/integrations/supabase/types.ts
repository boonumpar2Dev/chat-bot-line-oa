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
      ai_context_cache: {
        Row: {
          content: string
          key: string
          meta: Json
          token_count: number
          updated_at: string
        }
        Insert: {
          content?: string
          key: string
          meta?: Json
          token_count?: number
          updated_at?: string
        }
        Update: {
          content?: string
          key?: string
          meta?: Json
          token_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          ai_enabled: boolean
          ai_persona: string
          allowed_service_types: string[]
          comparison_instruction: string
          comparison_kb_category: string | null
          comparison_phase_enabled: boolean
          confidence_threshold: number
          cooldown_minutes: number
          created_at: string
          debounce_seconds: number
          end_time: string
          fallback_message: string
          fallback_mute_hours: number
          followup_enabled: boolean
          followup_hours: number
          forbidden_terms: string[]
          id: string
          image_selection_rules: string
          intent_collection_order: string
          key: string
          manual_chat_hours: number
          phone_mute_hours: number
          post_phone_max_replies: number
          schedule_enabled: boolean
          sla_hours: number
          start_time: string
          strict_rules: string[]
          tax_id_keywords: string[]
          tier_special_rules: string
          trivial_replies: string[]
          updated_at: string
        }
        Insert: {
          ai_enabled?: boolean
          ai_persona?: string
          allowed_service_types?: string[]
          comparison_instruction?: string
          comparison_kb_category?: string | null
          comparison_phase_enabled?: boolean
          confidence_threshold?: number
          cooldown_minutes?: number
          created_at?: string
          debounce_seconds?: number
          end_time?: string
          fallback_message?: string
          fallback_mute_hours?: number
          followup_enabled?: boolean
          followup_hours?: number
          forbidden_terms?: string[]
          id?: string
          image_selection_rules?: string
          intent_collection_order?: string
          key: string
          manual_chat_hours?: number
          phone_mute_hours?: number
          post_phone_max_replies?: number
          schedule_enabled?: boolean
          sla_hours?: number
          start_time?: string
          strict_rules?: string[]
          tax_id_keywords?: string[]
          tier_special_rules?: string
          trivial_replies?: string[]
          updated_at?: string
        }
        Update: {
          ai_enabled?: boolean
          ai_persona?: string
          allowed_service_types?: string[]
          comparison_instruction?: string
          comparison_kb_category?: string | null
          comparison_phase_enabled?: boolean
          confidence_threshold?: number
          cooldown_minutes?: number
          created_at?: string
          debounce_seconds?: number
          end_time?: string
          fallback_message?: string
          fallback_mute_hours?: number
          followup_enabled?: boolean
          followup_hours?: number
          forbidden_terms?: string[]
          id?: string
          image_selection_rules?: string
          intent_collection_order?: string
          key?: string
          manual_chat_hours?: number
          phone_mute_hours?: number
          post_phone_max_replies?: number
          schedule_enabled?: boolean
          sla_hours?: number
          start_time?: string
          strict_rules?: string[]
          tax_id_keywords?: string[]
          tier_special_rules?: string
          trivial_replies?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      auto_responses: {
        Row: {
          created_at: string
          file_urls: string[]
          id: string
          image_urls: string[]
          is_active: boolean
          name: string
          sort_order: number
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_urls?: string[]
          id?: string
          image_urls?: string[]
          is_active?: boolean
          name: string
          sort_order?: number
          text?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_urls?: string[]
          id?: string
          image_urls?: string[]
          is_active?: boolean
          name?: string
          sort_order?: number
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      catering_packages: {
        Row: {
          ai_instruction: string | null
          category: string | null
          created_at: string
          custom_attributes: Json
          description: string | null
          id: string
          image_urls: string[]
          is_active: boolean
          min_condition: string | null
          name: string
          notes: string | null
          pricing_tiers: Json
          updated_at: string
          video_urls: Json
        }
        Insert: {
          ai_instruction?: string | null
          category?: string | null
          created_at?: string
          custom_attributes?: Json
          description?: string | null
          id?: string
          image_urls?: string[]
          is_active?: boolean
          min_condition?: string | null
          name: string
          notes?: string | null
          pricing_tiers?: Json
          updated_at?: string
          video_urls?: Json
        }
        Update: {
          ai_instruction?: string | null
          category?: string | null
          created_at?: string
          custom_attributes?: Json
          description?: string | null
          id?: string
          image_urls?: string[]
          is_active?: boolean
          min_condition?: string | null
          name?: string
          notes?: string | null
          pricing_tiers?: Json
          updated_at?: string
          video_urls?: Json
        }
        Relationships: []
      }
      conversations: {
        Row: {
          confidence_score: number | null
          created_at: string
          customer_id: string
          id: string
          is_fallback: boolean
          line_message_id: string | null
          message: string
          sender: Database["public"]["Enums"]["message_sender"]
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          customer_id: string
          id?: string
          is_fallback?: boolean
          line_message_id?: string | null
          message: string
          sender?: Database["public"]["Enums"]["message_sender"]
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          customer_id?: string
          id?: string
          is_fallback?: boolean
          line_message_id?: string | null
          message?: string
          sender?: Database["public"]["Enums"]["message_sender"]
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          admin_notes: string | null
          ai_active: boolean
          ai_resumed_at: string | null
          clv_amount: number
          contact_year: number | null
          conversation_summary: string | null
          created_at: string
          display_name: string | null
          event_date: string | null
          event_month: string | null
          event_type: string | null
          guest_count: number | null
          id: string
          last_message_at: string | null
          last_message_snippet: string | null
          last_sent_image_titles: string[]
          line_user_id: string
          manual_chat_until: string | null
          nickname: string | null
          phone: string | null
          phone_saved_at: string | null
          picture_url: string | null
          sla_deadline: string | null
          status: Database["public"]["Enums"]["customer_status"]
          summary_until_message_id: string | null
          tags: string[]
          tax_id: string | null
          unread_count: number
          updated_at: string
          venue: string | null
        }
        Insert: {
          admin_notes?: string | null
          ai_active?: boolean
          ai_resumed_at?: string | null
          clv_amount?: number
          contact_year?: number | null
          conversation_summary?: string | null
          created_at?: string
          display_name?: string | null
          event_date?: string | null
          event_month?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          last_message_at?: string | null
          last_message_snippet?: string | null
          last_sent_image_titles?: string[]
          line_user_id: string
          manual_chat_until?: string | null
          nickname?: string | null
          phone?: string | null
          phone_saved_at?: string | null
          picture_url?: string | null
          sla_deadline?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          summary_until_message_id?: string | null
          tags?: string[]
          tax_id?: string | null
          unread_count?: number
          updated_at?: string
          venue?: string | null
        }
        Update: {
          admin_notes?: string | null
          ai_active?: boolean
          ai_resumed_at?: string | null
          clv_amount?: number
          contact_year?: number | null
          conversation_summary?: string | null
          created_at?: string
          display_name?: string | null
          event_date?: string | null
          event_month?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          last_message_at?: string | null
          last_message_snippet?: string | null
          last_sent_image_titles?: string[]
          line_user_id?: string
          manual_chat_until?: string | null
          nickname?: string | null
          phone?: string | null
          phone_saved_at?: string | null
          picture_url?: string | null
          sla_deadline?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          summary_until_message_id?: string | null
          tags?: string[]
          tax_id?: string | null
          unread_count?: number
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          bundle_image_titles: string[]
          category: string | null
          content: string
          created_at: string
          id: string
          image_urls: string[]
          sort_order: number
          status: string
          title: string
          updated_at: string
          video_urls: Json
        }
        Insert: {
          bundle_image_titles?: string[]
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          image_urls?: string[]
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
          video_urls?: Json
        }
        Update: {
          bundle_image_titles?: string[]
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          image_urls?: string[]
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
          video_urls?: Json
        }
        Relationships: []
      }
      knowledge_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      package_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          applicable_categories: string[]
          created_at: string
          description: string | null
          id: string
          image_urls: string[]
          is_active: boolean
          min_guests: number | null
          name: string
          updated_at: string
          video_urls: Json
        }
        Insert: {
          applicable_categories?: string[]
          created_at?: string
          description?: string | null
          id?: string
          image_urls?: string[]
          is_active?: boolean
          min_guests?: number | null
          name: string
          updated_at?: string
          video_urls?: Json
        }
        Update: {
          applicable_categories?: string[]
          created_at?: string
          description?: string | null
          id?: string
          image_urls?: string[]
          is_active?: boolean
          min_guests?: number | null
          name?: string
          updated_at?: string
          video_urls?: Json
        }
        Relationships: []
      }
      role_menu_permissions: {
        Row: {
          menu_keys: string[]
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          menu_keys?: string[]
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          menu_keys?: string[]
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      user_menu_permissions: {
        Row: {
          menu_keys: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          menu_keys?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          menu_keys?: string[]
          updated_at?: string
          user_id?: string
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
    }
    Enums: {
      app_role: "admin" | "manager" | "staff"
      customer_status:
        | "new"
        | "returning"
        | "pending_quote"
        | "pending_confirm"
        | "confirmed"
        | "cancelled"
      message_sender: "customer" | "ai" | "admin"
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
      app_role: ["admin", "manager", "staff"],
      customer_status: [
        "new",
        "returning",
        "pending_quote",
        "pending_confirm",
        "confirmed",
        "cancelled",
      ],
      message_sender: ["customer", "ai", "admin"],
    },
  },
} as const
